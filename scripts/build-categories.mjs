#!/usr/bin/env node
/**
 * Regenerates /categories/{slug}.html for each of the 7 categories from data/published.json.
 *
 * Each category page filters its articles by category, shows a hero with a brief description,
 * an article grid, an ad zone, a newsletter CTA, and gracefully renders an empty-state when
 * no articles exist yet in that category.
 *
 * Run directly:          npm run build-categories
 * Called from pipeline:  imported by scripts/fetch-and-publish.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(process.cwd());
const PUBLISHED_PATH = path.join(ROOT, 'data', 'published.json');
const CATEGORIES_DIR = path.join(ROOT, 'categories');
const SITE_URL = process.env.SITE_URL || 'https://aiglimpse.ai';

const CATEGORIES = {
  llms: {
    name: 'LLMs & Chatbots',
    tag: 'llm',
    short: 'LLMs',
    description: 'The latest news, releases, and analysis on large language models, ChatGPT, Claude, Gemini, Llama, and the labs building them.',
    intro: 'Coverage of large language models, releases, benchmarks, technical analysis, and the labs building them. GPT, Claude, Gemini, Llama, and what\'s next.',
    keywords: 'LLM news, large language models, ChatGPT, Claude, Gemini, Llama, GPT, Anthropic, OpenAI'
  },
  research: {
    name: 'AI Research',
    tag: 'research',
    short: 'Research',
    description: 'Cutting-edge AI research, papers, breakthroughs, benchmarks, and the long-arc trends shaping artificial intelligence.',
    intro: 'Papers, breakthroughs, benchmarks, and the long-arc trends shaping artificial intelligence. arXiv highlights and lab announcements, distilled.',
    keywords: 'AI research, arXiv, machine learning research, AI papers, deep learning, neural networks'
  },
  tools: {
    name: 'AI Tools & Products',
    tag: 'tools',
    short: 'Tools',
    description: 'Launches, releases, and hands-on coverage of the AI tools you\'ll actually use, coding assistants, agents, creative tools, and more.',
    intro: 'Launches, releases, and hands-on coverage of the AI tools you\'ll actually use, coding assistants, agents, creative tools, and the infrastructure underneath.',
    keywords: 'AI tools, AI products, Cursor, Copilot, AI apps, AI software'
  },
  business: {
    name: 'AI Business',
    tag: 'business',
    short: 'Business',
    description: 'Funding rounds, valuations, M&A, earnings, and the economics of building and selling AI in 2026.',
    intro: 'Funding rounds, valuations, M&A, earnings, and the economics of building and selling AI. The money flowing through the AI economy.',
    keywords: 'AI business, AI funding, AI valuations, AI startups, AI revenue, AI venture capital'
  },
  ethics: {
    name: 'Ethics & Policy',
    tag: 'ethics',
    short: 'Ethics',
    description: 'AI regulation, safety research, governance, and the policy debates shaping how artificial intelligence is deployed.',
    intro: 'Regulation, safety research, governance, copyright, and the policy debates shaping how artificial intelligence is deployed in the world.',
    keywords: 'AI ethics, AI policy, AI regulation, AI safety, AI governance, EU AI Act'
  },
  industry: {
    name: 'AI in Industry',
    tag: 'industry',
    short: 'Industry',
    description: 'AI deployments across healthcare, finance, manufacturing, and enterprise. What\'s actually working in the wild.',
    intro: 'AI deployments across healthcare, finance, manufacturing, retail, and enterprise. What\'s actually working in the wild, and what isn\'t.',
    keywords: 'AI industry, enterprise AI, AI deployment, AI healthcare, AI finance, AI manufacturing'
  },
  robotics: {
    name: 'Robotics',
    tag: 'robotics',
    short: 'Robotics',
    description: 'Humanoid robots, embodied AI, autonomous systems, and the hardware-software co-design making real-world robots possible.',
    intro: 'Humanoid robots, embodied AI, autonomous systems, and the hardware-software co-design making real-world robots possible.',
    keywords: 'AI robotics, humanoid robots, embodied AI, autonomous systems, Figure, Boston Dynamics, Tesla Bot'
  }
};

const PER_PAGE = 18; // articles to show per category page

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function articleUrl(a) { return a.href || `/articles/${a.slug}.html`; }
function articleImage(a) { return a.image || '/images/placeholder.svg'; }

function displayDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}

function timeTag(iso) {
  return `<time datetime="${iso}">${displayDate(iso)}</time>`;
}

function card(a, cat) {
  const u = articleUrl(a);
  return `          <article class="card card--large">
            <a href="${u}"><div class="card-image"><img src="${articleImage(a)}" alt="${escapeHtml(a.title)}" loading="lazy" width="1200" height="630"></div></a>
            <div class="card-meta">
              <span class="tag tag--${cat.tag}">${escapeHtml(cat.short)}</span>
              <span class="card-byline">${timeTag(a.publishedAt)}</span>
            </div>
            <a href="${u}"><h2 class="card-title">${escapeHtml(a.title)}</h2></a>
            ${a.subtitle ? `<p class="card-excerpt">${escapeHtml(a.subtitle)}</p>` : ''}
          </article>`;
}

function emptyState(catName) {
  return `<div style="padding:var(--space-9) var(--space-5);text-align:center;border:1px dashed var(--color-rule);border-radius:12px;background:var(--color-paper-elevated);">
          <p class="eyebrow eyebrow--accent" style="margin-bottom:var(--space-3);">Coming soon</p>
          <h2 style="font-family:var(--font-display);font-size:var(--text-2xl);font-weight:600;margin-bottom:var(--space-3);">${escapeHtml(catName)} coverage is loading.</h2>
          <p style="color:var(--color-ink-muted);max-width:520px;margin:0 auto;">We're aggregating the latest stories now. Check back in a few minutes, or <a href="#newsletter" style="color:var(--color-accent);">subscribe</a> to get them by email.</p>
        </div>`;
}

function renderPage(slug, cat, articles) {
  const url = `${SITE_URL}/categories/${slug}.html`;
  const articleCards = articles.length
    ? `<div class="grid grid-3">
${articles.map(a => card(a, cat)).join('\n')}
        </div>`
    : emptyState(cat.name);

  const itemListSchema = articles.length ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${cat.name} | AI Glimpse`,
    itemListElement: articles.slice(0, 10).map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/articles/${a.slug}.html`,
      name: a.title
    }))
  } : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(cat.name)}: Latest News &amp; Analysis | AI Glimpse</title>
  <meta name="description" content="${escapeHtml(cat.description)}">
  <meta name="keywords" content="${escapeHtml(cat.keywords)}">
  <link rel="canonical" href="${url}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AI Glimpse">
  <meta property="og:title" content="${escapeHtml(cat.name)} | AI Glimpse">
  <meta property="og:description" content="${escapeHtml(cat.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE_URL}/images/og-default.png">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@aiglimpse">
  <meta name="twitter:title" content="${escapeHtml(cat.name)} | AI Glimpse">
  <meta name="twitter:description" content="${escapeHtml(cat.description)}">

  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="alternate" type="application/rss+xml" title="AI Glimpse RSS" href="/rss.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/css/main.css">

  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4263484717830850" crossorigin="anonymous"></script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "${escapeHtml(cat.name)}",
    "description": "${escapeHtml(cat.description)}",
    "url": "${url}",
    "isPartOf": { "@type": "WebSite", "name": "AI Glimpse", "url": "${SITE_URL}/" }
  }
  </script>
${itemListSchema ? `  <script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>` : ''}
</head>
<body>

  <div id="site-header-slot"></div>

  <main>

    <!-- Category hero -->
    <section style="padding: var(--space-7) 0 var(--space-6); border-bottom: 1px solid var(--color-rule);">
      <div class="container">
        <nav aria-label="Breadcrumb" style="margin-bottom:var(--space-3);font-size:var(--text-xs);color:var(--color-ink-muted);">
          <a href="/" style="color:inherit;">Home</a> / <span>${escapeHtml(cat.name)}</span>
        </nav>
        <span class="tag tag--${cat.tag}" style="margin-bottom:var(--space-4);display:inline-block;">Category</span>
        <h1 style="font-size: clamp(2.25rem, 5vw, var(--text-5xl)); margin-bottom: var(--space-3);">${escapeHtml(cat.name)}</h1>
        <p style="font-size: var(--text-md); color: var(--color-ink-muted); max-width: 64ch;">${escapeHtml(cat.intro)}</p>
      </div>
    </section>

    <div class="container">
      <div class="ad-zone ad-zone--leaderboard">
        <span style="color:var(--color-ink-faint);font-size:0.75rem;">Ad zone, Leaderboard</span>
      </div>
    </div>

    <!-- Article grid -->
    <section class="section" style="border-bottom: none;">
      <div class="container">
        ${articleCards}
      </div>
    </section>

    <!-- Newsletter -->
    <section class="newsletter" id="newsletter">
      <div class="container">
        <div class="newsletter-inner">
          <div>
            <span class="newsletter-eyebrow">AI Glimpse Daily</span>
            <h2 class="newsletter-title">Never miss a ${escapeHtml(cat.short)} story.</h2>
            <p class="newsletter-subtitle">Daily roundup of the AI stories that matter, straight to your inbox.</p>
          </div>
          <form class="newsletter-form" novalidate>
            <label class="sr-only" for="newsletter-email">Email address</label>
            <div class="newsletter-input-group">
              <input type="email" id="newsletter-email" class="newsletter-input" placeholder="your@email.com" required>
              <button type="submit" class="newsletter-submit">Subscribe</button>
            </div>
            <p class="newsletter-note">Free forever. Unsubscribe in one click.</p>
          </form>
        </div>
      </div>
    </section>

  </main>

  <div id="site-footer-slot"></div>

  <script src="/js/chrome.js"></script>
  <script src="/js/main.js"></script>
</body>
</html>
`;
}

export async function buildCategories() {
  let idx = { articles: [] };
  try { idx = JSON.parse(await fs.readFile(PUBLISHED_PATH, 'utf8')); }
  catch { /* empty */ }
  const articles = idx.articles || [];

  await fs.mkdir(CATEGORIES_DIR, { recursive: true });

  const summary = [];
  for (const [slug, cat] of Object.entries(CATEGORIES)) {
    const filtered = articles.filter(a => a.category === slug).slice(0, PER_PAGE);
    const html = renderPage(slug, cat, filtered);
    await fs.writeFile(path.join(CATEGORIES_DIR, `${slug}.html`), html);
    summary.push(`${slug}=${filtered.length}`);
  }
  console.log(`  ✓ categories rebuilt (${summary.join(', ')})`);
  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  buildCategories().catch(e => { console.error(e); process.exit(1); });
}
