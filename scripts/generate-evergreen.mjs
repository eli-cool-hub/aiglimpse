#!/usr/bin/env node
/**
 * AI Glimpse Evergreen Pipeline
 *
 * Long-form, topic-cornerstone explainers (1500 to 2500 words) on the highest
 * search-volume AI questions. These don't go stale, they bring recurring search
 * traffic for years, and they anchor topical authority on the domain.
 *
 * Differs from fetch-and-publish.mjs in three ways:
 *   1. Source is an internal topics list, not RSS / arXiv / HN.
 *   2. Claude prompt asks for 1500 to 2500 word longform with structured H2s
 *      and a FAQ section, not 400 to 700 word news.
 *   3. Output HTML carries a second JSON-LD block with FAQPage schema so each
 *      Q&A is eligible for the FAQ rich result on Google.
 *
 * CLI:
 *   node scripts/generate-evergreen.mjs               # publish every topic that isn't already on disk
 *   node scripts/generate-evergreen.mjs --slug rag    # publish a single topic by slug
 *   node scripts/generate-evergreen.mjs --weekly          # publish the next queued topic (for cron)
 *   node scripts/generate-evergreen.mjs --count 2       # publish up to N unpublished topics
 *
 * Required env: ANTHROPIC_API_KEY · SITE_URL
 * Optional env: PEXELS_API_KEY · INDEXNOW_KEY
 */

import fs from 'fs/promises';
import path from 'path';
import { generateArticleImage, generateInlineImages, injectInlineImages, resetImageSession } from './lib/images.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';
import { regenerateSitemap, pingIndexNow } from './lib/sitemap.mjs';
import { syndicate } from './lib/syndicate.mjs';
import { EVERGREEN_TOPICS } from './lib/evergreen-topics.mjs';
import { EVERGREEN_LINK_MAP } from './lib/evergreen-links.mjs';
import { buildGuidesPage } from './build-guides.mjs';
import { buildSearchIndex } from './build-search-index.mjs';
import { headerHtml, footerHtml, FONT_LINKS } from './lib/chrome.mjs';
import { pictureHtml, heroPreload } from './lib/media.mjs';
import { relatedSectionHtml, breadcrumbSchema } from './lib/related.mjs';

const ROOT = path.resolve(process.cwd());
const ARTICLES_DIR = path.join(ROOT, 'articles');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLISHED_INDEX = path.join(DATA_DIR, 'published.json');
const SITE_URL = process.env.SITE_URL || 'https://aiglimpse.ai';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const ARGS = process.argv.slice(2);
const TARGET_SLUG = (() => {
  const i = ARGS.indexOf('--slug');
  return i >= 0 ? ARGS[i + 1] : null;
})();
const FORCE = ARGS.includes('--force');
const WEEKLY = ARGS.includes('--weekly');
const COUNT = (() => {
  const i = ARGS.indexOf('--count');
  return i >= 0 ? Math.max(1, parseInt(ARGS[i + 1], 10) || 1) : null;
})();

async function topicOnDisk(slug) {
  try {
    await fs.access(path.join(ARTICLES_DIR, `${slug}.html`));
    return true;
  } catch {
    return false;
  }
}

function isTopicPublished(topic, published) {
  return published.articles.some(a => a.slug === topic.slug);
}

async function selectTopicQueue(published) {
  if (TARGET_SLUG) {
    const t = EVERGREEN_TOPICS.find(x => x.slug === TARGET_SLUG);
    return t ? [t] : [];
  }
  const unpublished = [];
  for (const topic of EVERGREEN_TOPICS) {
    const onDisk = await topicOnDisk(topic.slug);
    const inIndex = isTopicPublished(topic, published);
    if ((onDisk || inIndex) && !FORCE) continue;
    unpublished.push(topic);
  }
  if (WEEKLY) return unpublished.slice(0, 1);
  if (COUNT != null) return unpublished.slice(0, COUNT);
  return unpublished;
}

// ────────────────────────────────────────────────────────────────────────
// Small helpers, copied (not shared) from fetch-and-publish.mjs because the
// pipelines diverge in body length and schema and we don't want a coupled lib.
// ────────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

function scrubDashes(obj) {
  const scrub = (s) => typeof s === 'string'
    ? s.replace(/—/g, ',').replace(/–/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    : s;
  const scrubFaq = (faq) => Array.isArray(faq) ? faq.map(qa => ({ q: scrub(qa.q), a: scrub(qa.a) })) : faq;
  return {
    ...obj,
    title: scrub(obj.title),
    subtitle: scrub(obj.subtitle),
    body_html: scrub(obj.body_html),
    meta_description: scrub(obj.meta_description),
    keywords: Array.isArray(obj.keywords) ? obj.keywords.map(scrub) : obj.keywords,
    faq: scrubFaq(obj.faq)
  };
}

// Internal cross-linking to evergreen guides + category hubs.
const CATEGORY_LINK_MAP = [
  { phrase: 'humanoid robot', url: '/categories/robotics' },
  { phrase: 'AI research', url: '/categories/research' },
  { phrase: 'AI safety', url: '/categories/ethics' },
  { phrase: 'AI ethics', url: '/categories/ethics' },
  { phrase: 'AI regulation', url: '/categories/ethics' },
  { phrase: 'AI tools', url: '/categories/tools' },
  { phrase: 'AI funding', url: '/categories/business' },
  { phrase: 'AI startups', url: '/categories/business' },
  { phrase: 'enterprise AI', url: '/categories/industry' }
];

function evergreenLinksForPublished(published) {
  const slugs = new Set((published?.articles || []).filter(a => a.evergreen).map(a => a.slug));
  return EVERGREEN_LINK_MAP.filter(({ url }) => slugs.has(url.replace(/^\/articles\//, '')));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addInternalLinks(html, currentCategory, published) {
  if (typeof html !== 'string' || !html.length) return html;
  const INTERNAL_LINK_MAP = [...evergreenLinksForPublished(published), ...CATEGORY_LINK_MAP];
  const protectedSegments = [];
  const stash = (snippet) => {
    protectedSegments.push(snippet);
    return `__PROTECT_${protectedSegments.length - 1}__`;
  };
  const protectByRegex = (re) => { html = html.replace(re, m => stash(m)); };
  protectByRegex(/<a\b[^>]*>[\s\S]*?<\/a>/gi);
  protectByRegex(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi);
  protectByRegex(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi);

  let added = 0;
  // Evergreens are longer, allow up to 4 internal links (still spread thin).
  for (const { phrase, url } of INTERNAL_LINK_MAP) {
    if (added >= 4) break;
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
  html = html.replace(/__PROTECT_(\d+)__/g, (_, i) => protectedSegments[parseInt(i, 10)]);
  return html;
}

const CATEGORY_LABELS = {
  llms: { name: 'LLMs & Chatbots', tag: 'llm' },
  research: { name: 'AI Research', tag: 'research' },
  tools: { name: 'AI Tools & Products', tag: 'tools' },
  business: { name: 'AI Business', tag: 'business' },
  ethics: { name: 'Ethics & Policy', tag: 'ethics' },
  industry: { name: 'AI in Industry', tag: 'industry' },
  robotics: { name: 'Robotics', tag: 'robotics' }
};

// ────────────────────────────────────────────────────────────────────────
// Claude longform prompt. Asks for structured JSON with body + FAQ array.
// ────────────────────────────────────────────────────────────────────────
async function generateEvergreen(topic) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required');

  // Two-section response format. The long body_html lives OUTSIDE the JSON
  // envelope, separated by a literal "===BODY===" marker. This avoids the
  // class of bug where Haiku drops a backslash-escape inside a multi-thousand-
  // character JSON string, which is the most common failure mode for
  // longform structured generation.
  const prompt = `You are a senior editor for AI Glimpse, an independent AI news publication competing with The Verge and The Information. You are writing an evergreen explainer, not breaking news.

Topic: ${topic.title_seed}
Audience: ${topic.audience}
Search intent: ${topic.intent}
Primary keywords (use naturally, never stuff): ${topic.keyword_focus.join(', ')}

Write a definitive longform explainer that will rank for years.

Length: 1500 to 2500 words of body content (excluding the FAQ).

Structure:
1. Lead paragraph: a clear, direct definition or thesis. No throat-clearing.
2. Section "Why this matters now": 1 to 2 paragraphs anchoring the topic in 2026 reality.
3. 4 to 6 H2 sections that walk through the substance. Each section opens with a one-sentence summary, then expands.
4. A "Common pitfalls" or "When this fails" section. Be honest about limitations.
5. A short closing paragraph that points to the practical next step.

Tone: authoritative, technically honest, slightly skeptical. Respect the reader's time. Do not oversell, do not hand-wave. Use concrete numbers when you can.

Format: HTML for the body. Use <p>, <h2>, <ul>/<li>, <ol>/<li>, <blockquote>, <strong>. No <h1>. No FAQ inside the body.

STYLE RULES (strictly enforced):
- NEVER use em dashes ("—" / U+2014). Use a comma, period, colon, or parentheses.
- NEVER use en dashes ("–" / U+2013). Use a hyphen or the word "to".
- Standard ASCII hyphen "-" is fine for compound words.
- Use straight quotes ("..." and '...'), not curly quotes.
- Editorial third person, no first-person marketing voice.

OUTPUT FORMAT (exact, no deviation):

===META===
{
  "title": "Headline, max 75 chars, contains the primary keyword naturally",
  "subtitle": "One-sentence deck, max 200 chars",
  "keywords": ["k1", "k2", "k3", "k4", "k5", "k6", "k7"],
  "meta_description": "150 to 160 chars, contains primary keyword",
  "faq": [
    {"q": "Question as it would be searched", "a": "2 to 4 sentence answer"}
  ]
}
===BODY===
<p>Lead paragraph...</p>
<h2>Why this matters now</h2>
<p>...</p>
<h2>Section heading</h2>
<p>...</p>
... (full HTML body, 1500 to 2500 words)
===END===

Rules:
- The META block contains ONLY valid JSON. Keep faq answers short, escape internal quotes as \\".
- The BODY block is raw HTML with no JSON escaping needed.
- Output the markers exactly as shown: "===META===", "===BODY===", "===END===" each on their own line.
- Provide 5 to 7 FAQ items.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.content[0].text;

  const metaMatch = raw.match(/===META===\s*([\s\S]*?)\s*===BODY===/);
  const bodyMatch = raw.match(/===BODY===\s*([\s\S]*?)\s*===END===/);
  if (!metaMatch || !bodyMatch) {
    throw new Error(`Response did not contain META/BODY markers. First 400 chars: ${raw.slice(0, 400)}`);
  }
  let metaJson = metaMatch[1].trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const firstBrace = metaJson.indexOf('{');
  const lastBrace = metaJson.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) metaJson = metaJson.slice(firstBrace, lastBrace + 1);

  let meta;
  try {
    meta = JSON.parse(metaJson);
  } catch (e) {
    throw new Error(`META JSON parse failed: ${e.message}. Content: ${metaJson.slice(0, 300)}`);
  }
  meta.body_html = bodyMatch[1].trim();
  return scrubDashes(meta);
}

// ────────────────────────────────────────────────────────────────────────
// HTML rendering. Two JSON-LD blocks: Article and FAQPage.
// ────────────────────────────────────────────────────────────────────────
function renderFaqHtml(faq) {
  if (!Array.isArray(faq) || !faq.length) return '';
  const items = faq.map(qa => `
    <details class="faq-item" style="border-bottom:1px solid var(--color-rule);padding:var(--space-4) 0;">
      <summary style="cursor:pointer;font-weight:600;font-size:var(--text-md);list-style:none;display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">
        <span>${escapeHtml(qa.q)}</span>
        <span aria-hidden="true" style="color:var(--color-ink-faint);font-weight:400;flex-shrink:0;">+</span>
      </summary>
      <div style="margin-top:var(--space-3);color:var(--color-ink-muted);line-height:1.7;">
        ${qa.a.split(/\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('')}
      </div>
    </details>`).join('\n');
  return `
      <section style="margin-top: var(--space-8);">
        <h2 style="margin-bottom: var(--space-5);">Frequently asked questions</h2>
        <div class="faq-list">${items}</div>
      </section>`;
}

function generateEvergreenHtml({ piece, slug, category, publishedAt, readingMinutes, imagePath, published }) {
  const cat = CATEGORY_LABELS[category];
  const isoDate = publishedAt.toISOString();
  const displayDate = publishedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const imageUrl = `${SITE_URL}${imagePath}`;
  const canonical = `${SITE_URL}/articles/${slug}`;

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    headline: piece.title,
    description: piece.meta_description,
    image: [imageUrl],
    datePublished: isoDate,
    dateModified: isoDate,
    author: { '@type': 'Organization', name: 'AI Glimpse Newsroom' },
    publisher: {
      '@type': 'Organization',
      name: 'AI Glimpse',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/images/logo.svg` }
    },
    articleSection: cat.name,
    keywords: piece.keywords.join(', ')
  };

  const faqSchema = Array.isArray(piece.faq) && piece.faq.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: piece.faq.map(qa => ({
      '@type': 'Question',
      name: qa.q,
      acceptedAnswer: { '@type': 'Answer', text: qa.a }
    }))
  } : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(piece.title)} | AI Glimpse</title>
  <meta name="description" content="${escapeHtml(piece.meta_description)}">
  <meta name="keywords" content="${escapeHtml(piece.keywords.join(', '))}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article"><meta property="og:site_name" content="AI Glimpse">
  <meta property="og:title" content="${escapeHtml(piece.title)}">
  <meta property="og:description" content="${escapeHtml(piece.meta_description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="article:published_time" content="${isoDate}">
  <meta property="article:section" content="${cat.name}">
  ${piece.keywords.map(k => `<meta property="article:tag" content="${escapeHtml(k)}">`).join('\n  ')}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(piece.title)}">
  <meta name="twitter:description" content="${escapeHtml(piece.meta_description)}">
  <meta name="twitter:image" content="${imageUrl}">
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="alternate" type="application/rss+xml" title="AI Glimpse RSS" href="/rss.xml">
  ${FONT_LINKS}
  <link rel="stylesheet" href="/css/main.css">
  ${heroPreload(imagePath)}
  <style>.reading-progress{position:fixed;top:0;left:0;height:3px;background:var(--color-accent);width:0%;z-index:200;transition:width 100ms linear;}</style>
  <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema(SITE_URL, { slug, category, categoryName: cat.name, title: piece.title }))}</script>
  ${faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : ''}
  <meta name="google-site-verification" content="B132aMlqf1nssWYhjOSKUgSjmfwNWgPgtozZsHDxWlU" />
  <meta name="msvalidate.01" content="F3762E555B3E685836AE39C90B79ECBF" />
  <!-- aiglimpse-consent-default v1: must run before AdSense, defaults all ad/analytics storage to denied -->
  <script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});try{var s=JSON.parse(localStorage.getItem('aiglimpse-consent')||'null');if(s&&s.choice==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}}catch(e){}})();</script>
  <!-- aiglimpse-ga4 v1: gtag.js loaded after consent default, so it buffers events until consent is granted -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EVZ52DNQ8S"></script>
  <script>gtag('js', new Date()); gtag('config', 'G-EVZ52DNQ8S', { anonymize_ip: true });</script>
</head>
<body>
  <div class="reading-progress" aria-hidden="true"></div>
  ${headerHtml()}
  <main>
    <article>
      <section class="article-hero">
        <div class="container container--narrow">
          <nav aria-label="Breadcrumb" style="margin-bottom:var(--space-4);font-size:var(--text-xs);color:var(--color-ink-muted);">
            <a href="/" style="color:inherit;">Home</a> /
            <a href="/categories/${category}" style="color:inherit;">${cat.name}</a> /
            <span>Explainer</span>
          </nav>
          <div class="article-hero-meta">
            <span class="tag tag--${cat.tag}">${cat.name}</span>
            <span class="eyebrow eyebrow--accent">Explainer</span>
            <span class="eyebrow">${readingMinutes} min read</span>
          </div>
          <h1 class="article-hero-title">${escapeHtml(piece.title)}</h1>
          <p class="article-hero-subtitle">${escapeHtml(piece.subtitle)}</p>
          <div class="article-byline">
            <div>By <strong>AI Glimpse Newsroom</strong></div><div>·</div>
            <div><time datetime="${isoDate}" data-relative="false">${displayDate}</time></div>
          </div>
        </div>
      </section>
      <section style="padding: var(--space-7) 0;">
        <div class="container container--narrow">
          <figure class="article-image">${pictureHtml(imagePath, piece.title, { loading: 'eager', fetchpriority: 'high' })}</figure>
          <div class="article-body">${piece.body_html}</div>
${renderFaqHtml(piece.faq)}
          <p style="font-size:var(--text-xs);color:var(--color-ink-faint);margin-top:var(--space-6);padding-top:var(--space-4);border-top:1px solid var(--color-rule);">
            An <strong>AI Glimpse</strong> explainer. We update this guide as the field evolves.
          </p>
        </div>
      </section>
    </article>
    ${relatedSectionHtml(published, { slug, category })}
  </main>
  ${footerHtml()}
  <script src="/js/chrome.js"></script>
  <script src="/js/main.js"></script>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────────
// Pipeline plumbing.
// ────────────────────────────────────────────────────────────────────────
async function loadPublished() {
  try {
    return JSON.parse(await fs.readFile(PUBLISHED_INDEX, 'utf8'));
  } catch {
    return { articles: [], hashes: [] };
  }
}

async function savePublished(idx) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PUBLISHED_INDEX, JSON.stringify(idx, null, 2));
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  AI Glimpse, Evergreen Explainer Pipeline');
  console.log('═══════════════════════════════════════════\n');

  await fs.mkdir(ARTICLES_DIR, { recursive: true });
  const published = await loadPublished();
  resetImageSession();

  const queue = await selectTopicQueue(published);

  if (!queue.length) {
    if (WEEKLY) {
      console.log('  ✓ Weekly evergreen queue empty — all topics published.');
      process.exit(0);
    }
    console.error(TARGET_SLUG ? `No topic matched --slug ${TARGET_SLUG}` : 'No unpublished evergreen topics remain.');
    if (TARGET_SLUG) {
      console.error('Available slugs:');
      EVERGREEN_TOPICS.forEach(t => console.error(`  - ${t.slug}`));
    }
    process.exit(TARGET_SLUG ? 1 : 0);
  }

  if (WEEKLY) console.log(`  📅 Weekly pick: ${queue[0].slug}`);

  const newUrls = [];
  let written = 0;

  for (const topic of queue) {
    const fileSlug = topic.slug;
    const filePath = path.join(ARTICLES_DIR, `${fileSlug}.html`);

    const existsOnDisk = await fs.access(filePath).then(() => true).catch(() => false);
    const existsInIndex = published.articles.some(a => a.slug === fileSlug);

    if ((existsOnDisk || existsInIndex) && !FORCE) {
      console.log(`  ↪ skip ${fileSlug} (already published, use --force to rewrite)`);
      continue;
    }

    console.log(`  → generating ${fileSlug}`);

    let piece;
    try {
      piece = await generateEvergreen(topic);
    } catch (e) {
      console.error(`  ✗ Claude failed for ${fileSlug}: ${e.message}`);
      continue;
    }

    piece.body_html = addInternalLinks(piece.body_html, topic.category, published);

    const publishedAt = new Date();
    const wordCount = piece.body_html.replace(/<[^>]+>/g, ' ').split(/\s+/).length
      + (piece.faq || []).reduce((n, qa) => n + (qa.a || '').split(/\s+/).length, 0);
    const readingMinutes = Math.max(5, Math.round(wordCount / 220));

    const imageOpts = {
      title: piece.title,
      subtitle: piece.subtitle,
      keywords: piece.keywords || [],
      bodyHtml: piece.body_html,
      category: topic.category
    };

    const imagePath = await generateArticleImage(fileSlug, imageOpts);

    const inline = await generateInlineImages(fileSlug, imageOpts, null, 2);
    piece.body_html = injectInlineImages(piece.body_html, inline);

    const html = generateEvergreenHtml({
      piece, slug: fileSlug, category: topic.category,
      publishedAt, readingMinutes, imagePath, published
    });
    await fs.writeFile(filePath, html);

    // Replace any existing entry, prepend a fresh one.
    published.articles = published.articles.filter(a => a.slug !== fileSlug);
    published.articles.unshift({
      slug: fileSlug,
      title: piece.title,
      subtitle: piece.subtitle,
      category: topic.category,
      publishedAt: publishedAt.toISOString(),
      sourceUrl: null,
      sourceName: 'AI Glimpse Newsroom',
      sourceTier: 0,
      image: imagePath,
      evergreen: true
    });

    newUrls.push(`${SITE_URL}/articles/${fileSlug}`);
    written++;
    console.log(`    ✓ ${piece.title.substring(0, 70)} (${wordCount} words, ${readingMinutes} min)`);

    // Evergreens are 1500+ word originals, perfect for syndication.
    try {
      const synd = await syndicate({
        slug: fileSlug,
        title: piece.title,
        subtitle: piece.subtitle,
        excerpt: piece.subtitle || piece.title,
        html_body: piece.body_html,
        canonical_url: `${SITE_URL}/articles/${fileSlug}`,
        tags: [topic.category, 'AI', 'machine learning', 'tutorial'],
        word_count: wordCount,
        category: topic.category
      });
      if (synd.medium) console.log(`      → medium: ${synd.medium}`);
      if (synd.devto) console.log(`      → dev.to: ${synd.devto}`);
      if (synd.hashnode) console.log(`      → hashnode: ${synd.hashnode}`);
      if (synd.errors) for (const [p, m] of Object.entries(synd.errors)) console.warn(`      ! ${p}: ${m}`);
    } catch (e) {
      console.warn(`      ! syndication: ${e.message}`);
    }
  }

  if (written) {
    await savePublished(published);
    await regenerateSitemap(published, SITE_URL, ROOT);
    await buildHomepage();
    await buildCategories();
    await buildGuidesPage();
    await buildSearchIndex();
    const ping = await pingIndexNow([`${SITE_URL}/`, ...newUrls], SITE_URL);
    if (ping.ok) console.log(`  ✓ IndexNow pinged ${ping.count} URLs (${ping.status})`);
    else if (!ping.skipped) console.warn(`  IndexNow returned ${ping.status}: ${ping.body || ''}`);
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ✓ Done: ${written} evergreen pieces written`);
  console.log(`═══════════════════════════════════════════`);
}

main().catch(e => { console.error('Evergreen pipeline error:', e); process.exit(1); });
