#!/usr/bin/env node
/**
 * AI Glimpse, Multi-Source News Pipeline
 *
 * Aggregates from:
 *   1. RSS feeds from frontier AI labs (OpenAI, Anthropic, DeepMind, Meta, etc.), Tier 1
 *   2. AI-focused publications (MIT Tech Review, VentureBeat, Verge, TechCrunch), Tier 2
 *   3. arXiv research papers, Tier 1 for research category
 *   4. Hacker News (AI stories with 50+ points), Tier 2 signal
 *   5. GitHub Trending AI repos, Tier 2 for tools
 *   6. NewsAPI.ai (optional), Tier 3 breadth backup
 *
 * Dedupes across sources, prioritizes authoritative sources, rewrites with Claude.
 *
 * Required env: ANTHROPIC_API_KEY · SITE_URL
 * Optional env: NEWSAPI_KEY · INDEXNOW_KEY
 */

import fs from 'fs/promises';
import path from 'path';
import { fetchAllRSS } from './lib/rss-sources.mjs';
import { fetchAIWeekly } from './lib/aiweekly.mjs';
import { fetchArxiv } from './lib/arxiv.mjs';
import { fetchHackerNews, fetchGitHubTrending } from './lib/community.mjs';
import { fetchNewsAPI } from './lib/newsapi.mjs';
import { deduplicate, contentHash } from './lib/dedupe.mjs';
import { isAiRelevant } from './lib/ai-relevance.mjs';
import { generateArticleImage, generateInlineImages, injectInlineImages, resetImageSession } from './lib/images.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';
import { syndicate, syndicationStats } from './lib/syndicate.mjs';
import { EVERGREEN_LINK_MAP } from './lib/evergreen-links.mjs';
import { regenerateSitemap as writeSitemap, pingIndexNow } from './lib/sitemap.mjs';

const ROOT = path.resolve(process.cwd());
const ARTICLES_DIR = path.join(ROOT, 'articles');
const DATA_DIR = path.join(ROOT, 'data');
const SITE_URL = process.env.SITE_URL || 'https://aiglimpse.ai';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const PUBLISHED_INDEX = path.join(DATA_DIR, 'published.json');
const MAX_PER_RUN = parseInt(process.env.MAX_PER_RUN || '8', 10);

// Per-category cap per cron run. Prevents a single source (arXiv on a busy day,
// for example) from flooding the homepage with one topic. With cap=2 and
// MAX_PER_RUN=8, every run reaches at least 4 different categories.
const PER_CATEGORY_CAP = parseInt(process.env.PER_CATEGORY_CAP || '2', 10);

const CATEGORIES = {
  llms: { name: 'LLMs & Chatbots', tag: 'llm', keywords: ['chatgpt', 'claude', 'gemini', 'llama', 'gpt', 'llm', 'language model', 'chatbot', 'mistral', 'deepseek', 'qwen'] },
  research: { name: 'AI Research', tag: 'research', keywords: ['research', 'paper', 'arxiv', 'benchmark', 'study', 'transformer', 'attention'] },
  tools: { name: 'AI Tools & Products', tag: 'tools', keywords: ['tool', 'app', 'product', 'launch', 'release', 'plugin', 'extension', 'ide', 'cursor', 'copilot'] },
  business: { name: 'AI Business', tag: 'business', keywords: ['funding', 'investment', 'valuation', 'ipo', 'acquisition', 'revenue', 'earnings', 'series a', 'series b', 'raise'] },
  ethics: { name: 'Ethics & Policy', tag: 'ethics', keywords: ['regulation', 'policy', 'ethics', 'safety', 'lawsuit', 'eu ai act', 'governance', 'bias', 'copyright'] },
  industry: { name: 'Industry Applications', tag: 'industry', keywords: ['healthcare', 'finance', 'manufacturing', 'enterprise', 'deployment', 'banking', 'retail', 'pharma'] },
  robotics: { name: 'Robotics', tag: 'robotics', keywords: ['robot', 'humanoid', 'autonomous', 'figure', 'boston dynamics', 'tesla bot', 'embodied'] }
};

function classify(text, suggested) {
  if (suggested && CATEGORIES[suggested]) return suggested;
  return classifyByKeywords(text);
}

// Pure keyword classification, ignores the source's `suggested` hint. We use this
// pre-rewrite so a strong title signal (e.g. "EU AI Act") can override the source's
// default category (e.g. arXiv defaults to research) before per-category caps apply.
function classifyByKeywords(text) {
  const t = String(text).toLowerCase();
  let best = 'tools', bestScore = 0;
  for (const [slug, cat] of Object.entries(CATEGORIES)) {
    const score = cat.keywords.reduce((s, kw) => s + (t.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { best = slug; bestScore = score; }
  }
  return best;
}

// Pre-rewrite category guess. Lets the round-robin distributor make a balanced pick
// before we spend Claude tokens on rewriting. Final category (post-Claude) may differ.
function preClassify(item) {
  const titleHit = classifyByKeywords(item.title || '');
  if (titleHit !== 'tools') return titleHit;
  return item.suggestedCategory || 'tools';
}

// Round-robin pick from ranked items so the homepage shows a balanced category mix
// instead of (for example) 8 arXiv research papers in a row.
function distributeAcrossCategories(items, totalCap, perCatCap) {
  const buckets = {};
  for (const item of items) {
    const cat = preClassify(item);
    (buckets[cat] = buckets[cat] || []).push(item);
  }
  const selected = [];
  const picks = {};
  while (selected.length < totalCap) {
    let pickedThisLoop = false;
    for (const cat of Object.keys(buckets)) {
      if (selected.length >= totalCap) break;
      const bucket = buckets[cat];
      if (!bucket.length) continue;
      if ((picks[cat] || 0) >= perCatCap) continue;
      selected.push(bucket.shift());
      picks[cat] = (picks[cat] || 0) + 1;
      pickedThisLoop = true;
    }
    if (!pickedThisLoop) break;
  }
  return { selected, picks };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 80).replace(/^-|-$/g, '');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadPublished() {
  try { return JSON.parse(await fs.readFile(PUBLISHED_INDEX, 'utf8')); }
  catch { return { articles: [], hashes: [] }; }
}

async function savePublished(idx) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PUBLISHED_INDEX, JSON.stringify(idx, null, 2));
}

async function rewriteArticle(source) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required');

  const prompt = `You are a senior editor for "AI Glimpse," an independent AI news publication competing with The Verge and The Information.

Rewrite this source as a completely original news article. Write in clear, authoritative prose. NEVER copy phrases verbatim from the source.

Source title: ${source.title}
Source publication: ${source.source?.title || 'Unknown'}
Source URL: ${source.url}
Source content:
${(source.body || source.summary || '').substring(0, 4500)}

Requirements:
- Original headline (max 75 chars), SEO-optimized, factual, no clickbait
- The story MUST be substantively about artificial intelligence, machine learning, LLMs, AI products, AI research, AI policy, robotics, or AI industry. If the source is not really about AI, return JSON with {"reject": true, "reason": "..."} and no other fields.
- Compelling deck sentence explaining significance
- 400-700 word body in HTML using <p>, <h2>, <ul>/<li>, <blockquote>
- Cite the source ONCE inline: "According to [Source publication]..."
- If this is an arXiv paper, frame as research news: explain what's new and why it matters
- If this is a GitHub repo, frame as a new tool launch
- If this is a Hacker News story, frame as community-driven AI news

STYLE RULES (strictly enforced):
- NEVER use em dashes (the character "—" / U+2014). Use a comma, period, colon, or parentheses instead.
- NEVER use en dashes (the character "–" / U+2013). Use a hyphen or the word "to".
- Do not use the em dash for parenthetical pauses, lists, or attribution. A comma works for parentheticals; a period for hard breaks; a colon to introduce a list or quote.
- Standard ASCII hyphen "-" is fine for compound words.
- Use straight quotes ("..." and '...'), not curly quotes.

Return ONLY valid JSON (no markdown fences, no preamble):
{
  "title": "Headline (max 75 chars)",
  "subtitle": "Deck sentence (max 200 chars)",
  "body_html": "Full body as HTML",
  "keywords": ["k1", "k2", "k3", "k4", "k5"],
  "meta_description": "Search snippet (150-160 chars)"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] })
  });

  if (!res.ok) throw new Error(`Claude API: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const clean = data.content[0].text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const parsed = JSON.parse(clean);
  if (parsed.reject) {
    const err = new Error(`Claude rejected non-AI story: ${parsed.reason || 'not AI-related'}`);
    err.skipped = true;
    throw err;
  }
  return scrubDashes(parsed);
}

// Internal cross-linking: rewrite the first occurrence of select topical phrases
// inside an article body into a link to the matching category page. Boosts crawl
// depth (Googlebot follows links across articles), improves topical clustering for
// SEO, and helps readers discover related coverage.
//
// Conservative on purpose:
//   • Only the FIRST occurrence of each phrase is linked (no link-spam look)
//   • At most 3 internal links added per article
//   • Never link inside existing <a> tags, headings, or blockquotes
//   • Longest phrases checked first so "large language model" wins over "model"
function evergreenLinksForPublished(published) {
  const slugs = new Set((published?.articles || []).filter(a => a.evergreen).map(a => a.slug));
  return EVERGREEN_LINK_MAP.filter(({ url }) => {
    const slug = url.replace(/^\/articles\//, '');
    return slugs.has(slug);
  });
}

// SEO internal links — longest phrases first so specific matches win.
const CATEGORY_LINK_MAP = [
  { phrase: 'large language models', url: '/categories/llms' },
  { phrase: 'large language model', url: '/categories/llms' },
  { phrase: 'language models', url: '/categories/llms' },
  { phrase: 'language model', url: '/categories/llms' },
  { phrase: 'humanoid robot', url: '/categories/robotics' },
  { phrase: 'humanoid robots', url: '/categories/robotics' },
  { phrase: 'AI research', url: '/categories/research' },
  { phrase: 'AI safety', url: '/categories/ethics' },
  { phrase: 'AI ethics', url: '/categories/ethics' },
  { phrase: 'AI regulation', url: '/categories/ethics' },
  { phrase: 'AI tools', url: '/categories/tools' },
  { phrase: 'AI agents', url: '/categories/tools' },
  { phrase: 'AI funding', url: '/categories/business' },
  { phrase: 'AI startups', url: '/categories/business' },
  { phrase: 'enterprise AI', url: '/categories/industry' }
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addInternalLinks(html, currentCategory, published) {
  if (typeof html !== 'string' || !html.length) return html;
  const INTERNAL_LINK_MAP = [...evergreenLinksForPublished(published), ...CATEGORY_LINK_MAP];

  // Step 1: hide existing anchors, headings, blockquotes behind placeholders so
  // we never touch them. The list grows as we go, every link we add later also
  // becomes a placeholder so subsequent phrases cannot match inside it (avoids
  // nested-anchor invalid HTML).
  const protectedSegments = [];
  const stash = (snippet) => {
    protectedSegments.push(snippet);
    return `__PROTECT_${protectedSegments.length - 1}__`;
  };
  const protectByRegex = (re) => { html = html.replace(re, m => stash(m)); };
  protectByRegex(/<a\b[^>]*>[\s\S]*?<\/a>/gi);
  protectByRegex(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi);
  protectByRegex(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi);

  // Step 2: walk phrases longest-first. Replace first match of each phrase, then
  // immediately stash the newly-created link so it cannot be nested into later.
  let added = 0;
  for (const { phrase, url } of INTERNAL_LINK_MAP) {
    if (added >= 3) break;
    if (currentCategory && url === `/categories/${currentCategory}`) continue;
    const re = new RegExp(`\\b(${escapeRegex(phrase)})\\b`, 'i');
    let inserted = false;
    html = html.replace(re, (m) => {
      if (inserted) return m;
      inserted = true;
      return stash(`<a href="${url}">${m}</a>`);
    });
    if (inserted) added++;
  }

  // Step 3: restore.
  html = html.replace(/__PROTECT_(\d+)__/g, (_, i) => protectedSegments[parseInt(i, 10)]);
  return html;
}

// Safety net: even if the model slips an em or en dash through, scrub it before publish.
// Em dash -> comma, en dash -> hyphen, also normalize curly quotes to straight.
function scrubDashes(obj) {
  const scrub = (s) => typeof s === 'string'
    ? s.replace(/—/g, ',').replace(/–/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    : s;
  return {
    ...obj,
    title: scrub(obj.title),
    subtitle: scrub(obj.subtitle),
    body_html: scrub(obj.body_html),
    meta_description: scrub(obj.meta_description),
    keywords: Array.isArray(obj.keywords) ? obj.keywords.map(scrub) : obj.keywords
  };
}

function generateArticleHtml({ rewritten, source, slug, category, publishedAt, readingMinutes, imagePath }) {
  const cat = CATEGORIES[category];
  const isoDate = publishedAt.toISOString();
  const displayDate = publishedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const imageUrl = `${SITE_URL}${imagePath}`;

  const schema = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/articles/${slug}` },
    headline: rewritten.title, description: rewritten.meta_description,
    image: [imageUrl],
    datePublished: isoDate, dateModified: isoDate,
    author: { '@type': 'Organization', name: 'AI Glimpse Newsroom' },
    publisher: { '@type': 'Organization', name: 'AI Glimpse', logo: { '@type': 'ImageObject', url: `${SITE_URL}/images/logo.svg` } },
    articleSection: cat.name, keywords: rewritten.keywords.join(', ')
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(rewritten.title)} | AI Glimpse</title>
  <meta name="description" content="${escapeHtml(rewritten.meta_description)}">
  <meta name="keywords" content="${escapeHtml(rewritten.keywords.join(', '))}">
  <link rel="canonical" href="${SITE_URL}/articles/${slug}">
  <meta property="og:type" content="article"><meta property="og:site_name" content="AI Glimpse">
  <meta property="og:title" content="${escapeHtml(rewritten.title)}">
  <meta property="og:description" content="${escapeHtml(rewritten.meta_description)}">
  <meta property="og:url" content="${SITE_URL}/articles/${slug}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="article:published_time" content="${isoDate}">
  <meta property="article:section" content="${cat.name}">
  ${rewritten.keywords.map(k => `<meta property="article:tag" content="${escapeHtml(k)}">`).join('\n  ')}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(rewritten.title)}">
  <meta name="twitter:description" content="${escapeHtml(rewritten.meta_description)}">
  <meta name="twitter:image" content="${imageUrl}">
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="alternate" type="application/rss+xml" title="AI Glimpse RSS" href="/rss.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/css/main.css">
  <style>.reading-progress{position:fixed;top:0;left:0;height:3px;background:var(--color-accent);width:0%;z-index:200;transition:width 100ms linear;}</style>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <meta name="google-site-verification" content="B132aMlqf1nssWYhjOSKUgSjmfwNWgPgtozZsHDxWlU" />
  <meta name="msvalidate.01" content="F3762E555B3E685836AE39C90B79ECBF" />
  <!-- aiglimpse-consent-default v1: must run before AdSense, defaults all ad/analytics storage to denied -->
  <script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});try{var s=JSON.parse(localStorage.getItem('aiglimpse-consent')||'null');if(s&&s.choice==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}}catch(e){}})();</script>
  <!-- aiglimpse-ga4 v1: gtag.js loaded after consent default, so it buffers events until consent is granted -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EVZ52DNQ8S"></script>
  <script>gtag('js', new Date()); gtag('config', 'G-EVZ52DNQ8S', { anonymize_ip: true });</script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4263484717830850" crossorigin="anonymous"></script>
</head>
<body>
  <div class="reading-progress" aria-hidden="true"></div>
  <div id="site-header-slot"></div>
  <main>
    <article>
      <section class="article-hero">
        <div class="container container--narrow">
          <nav aria-label="Breadcrumb" style="margin-bottom:var(--space-4);font-size:var(--text-xs);color:var(--color-ink-muted);">
            <a href="/" style="color:inherit;">Home</a> /
            <a href="/categories/${category}" style="color:inherit;">${cat.name}</a>
          </nav>
          <div class="article-hero-meta">
            <span class="tag tag--${cat.tag}">${cat.name}</span>
            <span class="eyebrow">${readingMinutes} min read</span>
          </div>
          <h1 class="article-hero-title">${escapeHtml(rewritten.title)}</h1>
          <p class="article-hero-subtitle">${escapeHtml(rewritten.subtitle)}</p>
          <div class="article-byline">
            <div>By <strong>AI Glimpse Newsroom</strong></div><div>·</div>
            <div><time datetime="${isoDate}" data-relative="false">${displayDate}</time></div>
          </div>
        </div>
      </section>
      <section style="padding: var(--space-7) 0;">
        <div class="container container--narrow">
          <figure class="article-image"><img src="${imagePath}" alt="${escapeHtml(rewritten.title)}" loading="eager" width="1200" height="630"></figure>
          <div class="article-body">${rewritten.body_html}</div>
          <!-- Inline ad slot, will be re-enabled once AdSense is approved -->
          <p style="font-size:var(--text-xs);color:var(--color-ink-faint);margin-top:var(--space-6);padding-top:var(--space-4);border-top:1px solid var(--color-rule);">
            Based on reporting from <a href="${source.url}" rel="nofollow noopener" target="_blank" style="color:inherit;text-decoration:underline;">${escapeHtml(source.source?.title || 'source')}</a>.
          </p>
        </div>
      </section>
    </article>
  </main>
  <div id="site-footer-slot"></div>
  <script src="/js/chrome.js"></script>
  <script src="/js/main.js"></script>
</body>
</html>`;
}

async function regenerateSitemapAndRss(published) {
  await writeSitemap(published, SITE_URL, ROOT);

  const recent = published.articles.slice(0, 1000);
  const rssItems = recent.slice(0, 50).map(a => `    <item>
      <title>${escapeHtml(a.title)}</title>
      <link>${SITE_URL}/articles/${a.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/articles/${a.slug}</guid>
      <description>${escapeHtml(a.subtitle || a.title)}</description>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <category>${escapeHtml(CATEGORIES[a.category]?.name || 'AI')}</category>
    </item>`).join('\n');

  await fs.writeFile(path.join(ROOT, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Glimpse</title>
    <link>${SITE_URL}/</link>
    <description>Your daily glimpse into AI</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>`);
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  AI Glimpse, Multi-Source Pipeline');
  console.log('═══════════════════════════════════════════\n');

  await fs.mkdir(ARTICLES_DIR, { recursive: true });
  const published = await loadPublished();

  console.log('PHASE 1: Gather\n');
  const [rss, aiweekly, arxiv, hn, github, newsapi] = await Promise.all([
    fetchAllRSS(48),
    fetchAIWeekly(48, 18),
    fetchArxiv(15, 48),
    fetchHackerNews(24, 50),
    fetchGitHubTrending(),
    fetchNewsAPI(NEWSAPI_KEY, 24)
  ]);

  const all = [...rss, ...aiweekly, ...arxiv, ...hn, ...github, ...newsapi];
  console.log(`\n  TOTAL collected: ${all.length} items\n`);

  console.log('PHASE 2: Dedupe');
  const unique = deduplicate(all);
  const fresh = unique.filter(item => !published.hashes.includes(contentHash(item)));
  const relevant = fresh.filter(item => {
    if (isAiRelevant(item)) return true;
    console.log(`  ↪ skip non-AI: ${item.title?.substring(0, 70)} [${item.source?.title}]`);
    return false;
  });
  console.log(`  ✓ ${relevant.length} AI-relevant items (${fresh.length - relevant.length} filtered) after cross-check with published index\n`);

  console.log('PHASE 3: Rank & Distribute');
  const ranked = relevant.sort((a, b) => {
    const tierDiff = (a.source.tier || 99) - (b.source.tier || 99);
    if (tierDiff !== 0) return tierDiff;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });
  const { selected, picks } = distributeAcrossCategories(ranked, MAX_PER_RUN, PER_CATEGORY_CAP);
  const distribution = Object.entries(picks).map(([c, n]) => `${c}=${n}`).join(' ');
  console.log(`  ✓ Selected ${selected.length} for publication (per-cat cap ${PER_CATEGORY_CAP}): ${distribution}\n`);

  console.log('PHASE 4: Rewrite & Publish');
  const newUrls = [];
  let count = 0;
  resetImageSession();

  for (const item of selected) {
    try {
      const rewritten = await rewriteArticle(item);
      if (!isAiRelevant({
        title: rewritten.title,
        summary: rewritten.subtitle,
        body: `${rewritten.body_html || ''} ${(rewritten.keywords || []).join(' ')}`
      }, { minScore: 3 })) {
        console.log(`  ↪ skip after rewrite (not AI): ${rewritten.title?.substring(0, 70)}`);
        continue;
      }
      const category = classify(`${rewritten.title} ${rewritten.body_html}`, item.suggestedCategory);
      rewritten.body_html = addInternalLinks(rewritten.body_html, category, published);
      const hash = contentHash(item);
      const slug = slugify(rewritten.title) + '-' + hash.substring(0, 8);
      const publishedAt = new Date(item.publishedAt);
      const wordCount = rewritten.body_html.replace(/<[^>]+>/g, ' ').split(/\s+/).length;
      const readingMinutes = Math.max(2, Math.round(wordCount / 220));

      const imageOpts = {
        title: rewritten.title,
        subtitle: rewritten.subtitle,
        keywords: rewritten.keywords || [],
        bodyHtml: rewritten.body_html,
        category
      };

      const imagePath = await generateArticleImage(slug, imageOpts);

      // Inline image: only for longer news articles (3+ H2s, ~500+ words).
      const h2Count = (rewritten.body_html.match(/<h2\b/gi) || []).length;
      if (h2Count >= 3 && wordCount >= 500) {
        const inline = await generateInlineImages(slug, imageOpts, null, 1);
        rewritten.body_html = injectInlineImages(rewritten.body_html, inline);
      }

      const html = generateArticleHtml({ rewritten, source: item, slug, category, publishedAt, readingMinutes, imagePath });
      await fs.writeFile(path.join(ARTICLES_DIR, `${slug}.html`), html);

      published.articles.unshift({
        slug, title: rewritten.title, subtitle: rewritten.subtitle, category,
        publishedAt: publishedAt.toISOString(), sourceUrl: item.url,
        sourceName: item.source.title, sourceTier: item.source.tier,
        image: imagePath
      });
      published.hashes.push(hash);
      newUrls.push(`${SITE_URL}/articles/${slug}`);
      count++;
      console.log(`  ✓ [${item.source.title}] ${rewritten.title.substring(0, 70)}`);

      // Syndicate to Medium / Dev.to / Hashnode with canonical_url back to
      // aiglimpse.ai. Quality gates inside syndicate() skip short news
      // and non-technical categories per platform. Never blocks publishing.
      try {
        const synd = await syndicate({
          slug,
          title: rewritten.title,
          subtitle: rewritten.subtitle,
          excerpt: rewritten.subtitle || rewritten.title,
          html_body: rewritten.body_html,
          canonical_url: `${SITE_URL}/articles/${slug}`,
          tags: [category, 'AI', 'machine learning'],
          word_count: wordCount,
          category
        });
        if (synd.skipped) {
          console.log(`    · syndication skipped: ${synd.reason}`);
        } else {
          if (synd.medium) console.log(`    → medium: ${synd.medium}`);
          if (synd.devto) console.log(`    → dev.to: ${synd.devto}`);
          if (synd.hashnode) console.log(`    → hashnode: ${synd.hashnode}`);
          if (synd.gates) {
            const decided = Object.entries(synd.gates).map(([p, ok]) => `${p}=${ok ? '✓' : '×'}`).join(' ');
            const tokens = Object.entries(synd.tokens_present || {}).map(([p, ok]) => `${p}${ok ? '' : '(no token)'}`).filter(s => s.includes('(')).join(' ');
            console.log(`    · gates: ${decided} | wc=${synd.word_count} cat=${synd.category}${tokens ? ' | ' + tokens : ''}`);
          }
          if (synd.errors) for (const [p, m] of Object.entries(synd.errors)) console.warn(`    ! ${p}: ${m}`);
        }
      } catch (e) {
        console.warn(`    ! syndication: ${e.message}`);
      }
    } catch (e) {
      if (e.skipped) console.log(`  ↪ skipped: ${e.message}`);
      else console.error(`  ✗ Failed on "${item.title?.substring(0, 60)}": ${e.message}`);
    }
  }

  if (published.articles.length > 1500) {
    published.articles = published.articles.slice(0, 1500);
    published.hashes = published.hashes.slice(-1500);
  }
  await savePublished(published);
  await regenerateSitemapAndRss(published);
  await buildHomepage();
  await buildCategories();

  if (newUrls.length > 0) {
    const ping = await pingIndexNow([`${SITE_URL}/`, ...newUrls], SITE_URL);
    if (ping.ok) console.log(`✓ IndexNow pinged ${ping.count} new URLs (${ping.status})`);
    else if (!ping.skipped) console.warn(`IndexNow returned ${ping.status}: ${ping.body || ''}`);
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ✓ Pipeline complete: ${count} articles published`);
  console.log(`═══════════════════════════════════════════`);
}

main().catch(e => { console.error('Pipeline error:', e); process.exit(1); });
