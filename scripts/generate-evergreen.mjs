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
 *   node scripts/generate-evergreen.mjs --force       # rewrite even if the file exists
 *
 * Required env: ANTHROPIC_API_KEY · SITE_URL
 * Optional env: PEXELS_API_KEY · INDEXNOW_KEY
 */

import fs from 'fs/promises';
import path from 'path';
import { generateArticleImage, resetImageSession } from './lib/images.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

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

// ────────────────────────────────────────────────────────────────────────
// Topic catalogue. Slug is the URL path, hash-suffix is appended automatically.
// `category` reuses the existing 7 categories so these articles land on
// /categories/<x>.html alongside news. `intent` is the search intent we are
// trying to capture, included verbatim in the prompt.
// ────────────────────────────────────────────────────────────────────────
const EVERGREEN_TOPICS = [
  {
    slug: 'what-is-retrieval-augmented-generation-rag',
    title_seed: 'What is Retrieval-Augmented Generation (RAG)? A complete 2026 guide',
    category: 'research',
    intent:
      'Beginner-to-intermediate explainer for developers and product managers who keep hearing "RAG" and want a clear, technically honest definition with concrete examples, an architecture walkthrough, and trade-offs vs alternatives.',
    keyword_focus: ['retrieval-augmented generation', 'RAG', 'vector database', 'embeddings', 'context window', 'hallucination'],
    audience: 'Developers and AI product managers'
  },
  {
    slug: 'rag-vs-fine-tuning-vs-prompt-engineering',
    title_seed: 'RAG vs fine-tuning vs prompt engineering: when to use each',
    category: 'research',
    intent:
      'Comparison guide for teams deciding how to customize an LLM. Reader wants a clear decision framework, cost ranges, latency implications, and concrete examples of when each technique is the right call.',
    keyword_focus: ['fine-tuning', 'RAG', 'prompt engineering', 'LoRA', 'instruction tuning', 'system prompt'],
    audience: 'Engineering leads choosing an AI customization strategy'
  },
  {
    slug: 'what-are-ai-agents-practical-guide-2026',
    title_seed: 'What are AI agents? A practical guide for builders in 2026',
    category: 'tools',
    intent:
      'Definitive 2026 overview of AI agents. Reader wants to know what an agent actually is (versus a chatbot), what frameworks exist, what real production use cases look like, and where agents reliably break.',
    keyword_focus: ['AI agents', 'agentic AI', 'autonomous agents', 'tool use', 'function calling', 'multi-agent'],
    audience: 'Software engineers and CTOs evaluating agentic systems'
  }
];

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

// Internal cross-linking, same conservative rules as the news pipeline.
const INTERNAL_LINK_MAP = [
  { phrase: 'large language models', url: '/categories/llms.html' },
  { phrase: 'large language model', url: '/categories/llms.html' },
  { phrase: 'language models', url: '/categories/llms.html' },
  { phrase: 'language model', url: '/categories/llms.html' },
  { phrase: 'humanoid robot', url: '/categories/robotics.html' },
  { phrase: 'AI research', url: '/categories/research.html' },
  { phrase: 'AI safety', url: '/categories/ethics.html' },
  { phrase: 'AI ethics', url: '/categories/ethics.html' },
  { phrase: 'AI regulation', url: '/categories/ethics.html' },
  { phrase: 'AI tools', url: '/categories/tools.html' },
  { phrase: 'AI agents', url: '/categories/tools.html' },
  { phrase: 'AI funding', url: '/categories/business.html' },
  { phrase: 'AI startups', url: '/categories/business.html' },
  { phrase: 'enterprise AI', url: '/categories/industry.html' }
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addInternalLinks(html, currentCategory) {
  if (typeof html !== 'string' || !html.length) return html;
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
    if (currentCategory && url === `/categories/${currentCategory}.html`) continue;
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

  const prompt = `You are a senior editor for AI Glimpse, an independent AI news publication competing with The Verge and The Information. You are writing an evergreen explainer, not breaking news.

Topic: ${topic.title_seed}
Audience: ${topic.audience}
Search intent: ${topic.intent}
Primary keywords (use naturally, never stuff): ${topic.keyword_focus.join(', ')}

Write a definitive longform explainer that will rank for years.

Length: 1500 to 2500 words in body_html (excluding the FAQ).

Structure (use this exact skeleton, but substitute the topic):
1. Lead paragraph: a clear, direct definition or thesis. No throat-clearing.
2. Section "Why this matters now": 1 to 2 paragraphs anchoring the topic in 2026 reality.
3. 4 to 6 H2 sections that walk through the substance. Each section opens with a one-sentence summary, then expands.
4. A "Common pitfalls" or "When this fails" section. Be honest about limitations.
5. A short closing paragraph that points to the practical next step.
6. Separately, return a faq array with 5 to 7 question/answer pairs that capture long-tail queries adjacent to the topic. Answers should be 2 to 4 sentences each.

Tone: authoritative, technically honest, slightly skeptical. We respect the reader's time. We don't oversell, we don't hand-wave. We use concrete numbers when we can.

Format: HTML in body_html. Use <p>, <h2>, <ul>/<li>, <ol>/<li>, <blockquote>, <strong>. No <h1> (the page already has one). Do not include the FAQ inside body_html, return it separately in the faq field.

STYLE RULES (strictly enforced):
- NEVER use em dashes ("—" / U+2014). Use a comma, period, colon, or parentheses.
- NEVER use en dashes ("–" / U+2013). Use a hyphen or the word "to".
- Standard ASCII hyphen "-" is fine for compound words.
- Use straight quotes ("..." and '...'), not curly quotes.
- No first-person plural marketing voice ("we believe", "we think"). Editorial third person.

Return ONLY valid JSON (no markdown fences, no preamble):
{
  "title": "Final headline, max 75 chars, must contain the primary keyword naturally",
  "subtitle": "One-sentence deck explaining what this guide answers, max 200 chars",
  "body_html": "<p>...</p><h2>...</h2>... (1500 to 2500 words, no FAQ, no h1)",
  "faq": [
    {"q": "Question phrased exactly how someone would search for it", "a": "2 to 4 sentence answer"},
    ...
  ],
  "keywords": ["k1", "k2", "k3", "k4", "k5", "k6", "k7"],
  "meta_description": "Search snippet, 150 to 160 chars, must contain primary keyword"
}`;

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
  const clean = data.content[0].text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const parsed = JSON.parse(clean);
  return scrubDashes(parsed);
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

function generateEvergreenHtml({ piece, slug, category, publishedAt, readingMinutes, imagePath }) {
  const cat = CATEGORY_LABELS[category];
  const isoDate = publishedAt.toISOString();
  const displayDate = publishedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const imageUrl = `${SITE_URL}${imagePath}`;
  const canonical = `${SITE_URL}/articles/${slug}.html`;

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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/css/main.css">
  <style>.reading-progress{position:fixed;top:0;left:0;height:3px;background:var(--color-accent);width:0%;z-index:200;transition:width 100ms linear;}</style>
  <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
  ${faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : ''}
  <meta name="google-site-verification" content="B132aMlqf1nssWYhjOSKUgSjmfwNWgPgtozZsHDxWlU" />
  <meta name="msvalidate.01" content="F3762E555B3E685836AE39C90B79ECBF" />
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
            <a href="/categories/${category}.html" style="color:inherit;">${cat.name}</a> /
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
          <figure class="article-image"><img src="${imagePath}" alt="${escapeHtml(piece.title)}" loading="eager" width="1200" height="630"></figure>
          <div class="article-body">${piece.body_html}</div>
${renderFaqHtml(piece.faq)}
          <p style="font-size:var(--text-xs);color:var(--color-ink-faint);margin-top:var(--space-6);padding-top:var(--space-4);border-top:1px solid var(--color-rule);">
            An <strong>AI Glimpse</strong> explainer. We update this guide as the field evolves.
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

async function regenerateSitemap(published) {
  // Same shape as fetch-and-publish.mjs to keep sitemaps consistent.
  const recent = published.articles.slice(0, 1000);
  const categoriesList = ['llms','research','tools','business','ethics','industry','robotics'];
  const staticUrls = [
    { loc: `${SITE_URL}/`, priority: 1.0, changefreq: 'hourly' },
    ...categoriesList.map(c => ({ loc: `${SITE_URL}/categories/${c}.html`, priority: 0.9, changefreq: 'hourly' })),
    { loc: `${SITE_URL}/pages/about.html`, priority: 0.5, changefreq: 'monthly' },
    { loc: `${SITE_URL}/pages/contact.html`, priority: 0.5, changefreq: 'monthly' }
  ];
  const articleEntries = recent.map(a => `  <url>
    <loc>${SITE_URL}/articles/${a.slug}.html</loc>
    <news:news>
      <news:publication><news:name>AI Glimpse</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${a.publishedAt}</news:publication_date>
      <news:title>${escapeHtml(a.title)}</news:title>
    </news:news>
    <changefreq>daily</changefreq><priority>${a.evergreen ? '0.9' : '0.8'}</priority>
  </url>`).join('\n');

  await fs.writeFile(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${staticUrls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
${articleEntries}
</urlset>`);
}

async function pingIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY;
  if (!key || !urls.length) return;
  const body = {
    host: new URL(SITE_URL).hostname,
    key,
    keyLocation: `${SITE_URL}/${key}.txt`,
    urlList: urls
  };
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body)
    });
    if (res.ok) console.log(`  ✓ IndexNow pinged ${urls.length} URLs (${res.status})`);
    else console.warn(`  IndexNow returned ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.warn('  IndexNow ping failed:', e.message);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  AI Glimpse, Evergreen Explainer Pipeline');
  console.log('═══════════════════════════════════════════\n');

  await fs.mkdir(ARTICLES_DIR, { recursive: true });
  const published = await loadPublished();
  resetImageSession();

  const queue = TARGET_SLUG
    ? EVERGREEN_TOPICS.filter(t => t.slug === TARGET_SLUG)
    : EVERGREEN_TOPICS;

  if (!queue.length) {
    console.error(`No topic matched --slug ${TARGET_SLUG}`);
    console.error('Available slugs:');
    EVERGREEN_TOPICS.forEach(t => console.error(`  - ${t.slug}`));
    process.exit(1);
  }

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

    piece.body_html = addInternalLinks(piece.body_html, topic.category);

    const publishedAt = new Date();
    const wordCount = piece.body_html.replace(/<[^>]+>/g, ' ').split(/\s+/).length
      + (piece.faq || []).reduce((n, qa) => n + (qa.a || '').split(/\s+/).length, 0);
    const readingMinutes = Math.max(5, Math.round(wordCount / 220));

    const imagePath = await generateArticleImage(fileSlug, piece.title, topic.category);

    const html = generateEvergreenHtml({
      piece, slug: fileSlug, category: topic.category,
      publishedAt, readingMinutes, imagePath
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

    newUrls.push(`${SITE_URL}/articles/${fileSlug}.html`);
    written++;
    console.log(`    ✓ ${piece.title.substring(0, 70)} (${wordCount} words, ${readingMinutes} min)`);
  }

  if (written) {
    await savePublished(published);
    await regenerateSitemap(published);
    await buildHomepage();
    await buildCategories();
    await pingIndexNow([SITE_URL + '/', ...newUrls]);
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ✓ Done: ${written} evergreen pieces written`);
  console.log(`═══════════════════════════════════════════`);
}

main().catch(e => { console.error('Evergreen pipeline error:', e); process.exit(1); });
