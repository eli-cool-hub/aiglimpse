#!/usr/bin/env node
/**
 * Builds index.html from data/published.json.
 *
 * - Reads the published article index (newest first)
 * - Slots articles into the homepage layout (hero, latest, deep dives, more)
 * - Gracefully hides sections that don't yet have enough articles
 * - Preserves all SEO / schema / OG / Twitter metadata exactly
 *
 * Run directly:        npm run build-homepage
 * Called from pipeline: imported by scripts/fetch-and-publish.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(process.cwd());
const PUBLISHED_PATH = path.join(ROOT, 'data', 'published.json');
const OUTPUT_PATH = path.join(ROOT, 'index.html');

const TAGS = {
  llms:     { tag: 'llm',      short: 'LLMs',     full: 'LLMs & Chatbots' },
  research: { tag: 'research', short: 'Research', full: 'AI Research' },
  tools:    { tag: 'tools',    short: 'Tools',    full: 'AI Tools' },
  business: { tag: 'business', short: 'Business', full: 'AI Business' },
  ethics:   { tag: 'ethics',   short: 'Ethics',   full: 'Ethics & Policy' },
  industry: { tag: 'industry', short: 'Industry', full: 'Industry' },
  robotics: { tag: 'robotics', short: 'Robotics', full: 'Robotics' }
};

function cat(c) { return TAGS[c] || TAGS.tools; }

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function articleUrl(a) {
  return a.href || `/articles/${a.slug}`;
}

function articleImage(a) {
  return a.image || '/images/placeholder.svg';
}

function displayDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function timeTag(iso) {
  return `<time datetime="${iso}">${displayDate(iso)}</time>`;
}

function cardFeatured(a) {
  const t = cat(a.category);
  const u = articleUrl(a);
  return `<article class="card card--featured">
            <a href="${u}">
              <div class="card-image"><img src="${articleImage(a)}" alt="${escapeHtml(a.title)}" loading="eager" width="1200" height="630"></div>
            </a>
            <div class="card-meta">
              <span class="tag tag--${t.tag}">${escapeHtml(t.full)}</span>
              <span class="card-byline">${timeTag(a.publishedAt)}</span>
            </div>
            <a href="${u}"><h1 class="card-title">${escapeHtml(a.title)}</h1></a>
            ${a.subtitle ? `<p class="card-excerpt">${escapeHtml(a.subtitle)}</p>` : ''}
          </article>`;
}

function cardSecondary(a) {
  const t = cat(a.category);
  const u = articleUrl(a);
  return `<article class="card card--medium">
              <div class="card-meta">
                <span class="tag tag--${t.tag}">${escapeHtml(t.short)}</span>
                <span class="card-byline">${timeTag(a.publishedAt)}</span>
              </div>
              <a href="${u}"><h2 class="card-title">${escapeHtml(a.title)}</h2></a>
              ${a.subtitle ? `<p class="card-excerpt">${escapeHtml(a.subtitle)}</p>` : ''}
            </article>`;
}

function cardLarge(a) {
  const t = cat(a.category);
  const u = articleUrl(a);
  return `<article class="card card--large">
            <a href="${u}"><div class="card-image"><img src="${articleImage(a)}" alt="${escapeHtml(a.title)}" loading="lazy" width="1200" height="630"></div></a>
            <div class="card-meta">
              <span class="tag tag--${t.tag}">${escapeHtml(t.short)}</span>
              <span class="card-byline">${timeTag(a.publishedAt)}</span>
            </div>
            <a href="${u}"><h3 class="card-title">${escapeHtml(a.title)}</h3></a>
            ${a.subtitle ? `<p class="card-excerpt">${escapeHtml(a.subtitle)}</p>` : ''}
          </article>`;
}

function cardCompact(a) {
  const t = cat(a.category);
  const u = articleUrl(a);
  return `<article class="card card--medium">
            <a href="${u}"><div class="card-image"><img src="${articleImage(a)}" alt="${escapeHtml(a.title)}" loading="lazy" width="1200" height="630"></div></a>
            <div class="card-meta">
              <span class="tag tag--${t.tag}">${escapeHtml(t.short)}</span>
              <span class="card-byline">${timeTag(a.publishedAt)}</span>
            </div>
            <a href="${u}"><h3 class="card-title">${escapeHtml(a.title)}</h3></a>
          </article>`;
}

function emptyHero() {
  return `<div class="container">
        <div style="padding:var(--space-9) var(--space-5);text-align:center;border:1px dashed var(--color-rule);border-radius:12px;background:var(--color-paper-elevated);">
          <p class="eyebrow eyebrow--accent" style="margin-bottom:var(--space-3);">Coming soon</p>
          <h1 style="font-family:var(--font-display);font-size:var(--text-3xl);font-weight:600;margin-bottom:var(--space-3);">Your daily glimpse into AI is loading.</h1>
          <p style="color:var(--color-ink-muted);max-width:520px;margin:0 auto;">We're publishing our first stories now. Check back in a few minutes, or subscribe below for the morning brief.</p>
        </div>
      </div>`;
}

function renderTicker(articles) {
  const top = articles.slice(0, Math.min(4, articles.length));
  if (top.length === 0) {
    return `<a href="#newsletter">Subscribe to AI Glimpse Daily, the AI news that matters, in five minutes.</a>`;
  }
  const item = (a) => `<a href="${articleUrl(a)}">${escapeHtml(a.title)}</a>`;
  return [...top, ...top].map(item).join('\n          ');
}

function renderHero(articles) {
  const featured = articles[0];
  if (!featured) return emptyHero();
  const secondary = articles.slice(1, 4);
  return `<div class="container">
        <div class="hero-grid">
          ${cardFeatured(featured)}
          ${secondary.length ? `<aside class="hero-secondary">
            ${secondary.map(cardSecondary).join('\n            ')}
          </aside>` : ''}
        </div>
      </div>`;
}

function renderLatest(articles) {
  const items = articles.slice(4, 10);
  if (!items.length) return '';
  return `

    <!-- LATEST NEWS -->
    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Latest</h2>
          <a href="/rss.xml" class="section-link">RSS feed</a>
        </div>
        <div class="grid grid-3">
          ${items.map(cardLarge).join('\n          ')}
        </div>
      </div>
    </section>`;
}

function renderDeepDives(articles) {
  const evergreens = articles.filter(a => a.evergreen);
  const items = (evergreens.length >= 2 ? evergreens : articles.slice(10, 12)).slice(0, 4);
  if (!items.length) return '';
  return `

    <!-- DEEP DIVES -->
    <section class="section" style="background:var(--color-paper-soft);">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Deep Dives</h2>
          <a href="/guides.html" class="section-link">All explainers</a>
        </div>
        <div class="grid grid-2">
          ${items.map(cardLarge).join('\n          ')}
        </div>
      </div>
    </section>`;
}

function renderMore(articles) {
  const items = articles.slice(12, 15);
  if (!items.length) return '';
  return `

    <!-- MORE -->
    <section class="section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">More from AI Glimpse</h2>
        </div>
        <div class="grid grid-3">
          ${items.map(cardCompact).join('\n          ')}
        </div>
      </div>
    </section>`;
}

function renderPage(articles) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Primary SEO -->
  <title>AI Glimpse: Your Daily Glimpse Into Artificial Intelligence</title>
  <meta name="description" content="Independent AI news, research, and analysis. Daily reporting on LLMs, AI tools, business, ethics, and the future of artificial intelligence.">
  <meta name="keywords" content="AI news, artificial intelligence, ChatGPT, Claude, OpenAI, Anthropic, machine learning, AI research, AI tools, AI business">
  <link rel="canonical" href="https://aiglimpse.ai/">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AI Glimpse">
  <meta property="og:title" content="AI Glimpse: Your Daily Glimpse Into Artificial Intelligence">
  <meta property="og:description" content="Independent AI news, research, and analysis. Daily reporting on LLMs, AI tools, business, ethics, and the future of artificial intelligence.">
  <meta property="og:url" content="https://aiglimpse.ai/">
  <meta property="og:image" content="https://aiglimpse.ai/images/og-default.png">
  <meta property="og:locale" content="en_US">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@aiglimpse">
  <meta name="twitter:title" content="AI Glimpse: Your Daily Glimpse Into Artificial Intelligence">
  <meta name="twitter:description" content="Independent AI news, research, and analysis. Daily reporting on LLMs, AI tools, business, ethics, and the future of artificial intelligence.">
  <meta name="twitter:image" content="https://aiglimpse.ai/images/og-default.png">

  <!-- Favicons -->
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="apple-touch-icon" href="/images/favicon.svg">

  <!-- RSS -->
  <link rel="alternate" type="application/rss+xml" title="AI Glimpse RSS" href="/rss.xml">

  <!-- Preconnect for performance -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <!-- Styles -->
  <link rel="stylesheet" href="/css/main.css">

  <!-- Structured Data: Organization + WebSite -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://aiglimpse.ai/#organization",
        "name": "AI Glimpse",
        "url": "https://aiglimpse.ai/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://aiglimpse.ai/images/logo.svg",
          "width": 512,
          "height": 512
        },
        "sameAs": ["https://twitter.com/aiglimpse", "https://linkedin.com/company/aiglimpse"]
      },
      {
        "@type": "WebSite",
        "@id": "https://aiglimpse.ai/#website",
        "url": "https://aiglimpse.ai/",
        "name": "AI Glimpse",
        "description": "Independent AI news, research, and analysis",
        "publisher": { "@id": "https://aiglimpse.ai/#organization" },
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://aiglimpse.ai/search.html?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      }
    ]
  }
  </script>

  <!-- Search engine site ownership verification -->
  <meta name="google-site-verification" content="B132aMlqf1nssWYhjOSKUgSjmfwNWgPgtozZsHDxWlU" />
  <meta name="msvalidate.01" content="F3762E555B3E685836AE39C90B79ECBF" />

  <!-- aiglimpse-consent-default v1: must run before AdSense, defaults all ad/analytics storage to denied -->
  <script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});try{var s=JSON.parse(localStorage.getItem('aiglimpse-consent')||'null');if(s&&s.choice==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}}catch(e){}})();</script>
  <!-- aiglimpse-ga4 v1: gtag.js loaded after consent default, so it buffers events until consent is granted -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EVZ52DNQ8S"></script>
  <script>gtag('js', new Date()); gtag('config', 'G-EVZ52DNQ8S', { anonymize_ip: true });</script>

  <!-- Google AdSense (publisher ca-pub-4263484717830850) -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4263484717830850" crossorigin="anonymous"></script>

  <!-- Google Analytics 4, replace G-XXXX with your measurement ID -->
  <!-- <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
  <script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-XXXXXXXXXX');</script> -->
</head>
<body>

  <div id="site-header-slot"></div>

  <!-- Breaking news ticker -->
  <div class="breaking-bar" aria-label="Breaking news">
    <div class="container">
      <span class="breaking-label"><span class="breaking-dot"></span>Breaking</span>
      <div class="breaking-ticker">
        <div class="breaking-ticker-track">
          ${renderTicker(articles)}
        </div>
      </div>
    </div>
  </div>

  <main>

    <!-- HERO -->
    <section class="hero">
      ${renderHero(articles)}
    </section>

    <!-- CATEGORIES STRIP -->
    <section class="categories-strip" aria-label="Browse categories">
      <div class="container">
        <div class="categories-grid">
          <a href="/categories/llms" class="category-pill">
            <span class="category-pill-icon">💬</span>
            <span class="category-pill-name">LLMs &amp; Chatbots</span>
          </a>
          <a href="/categories/research" class="category-pill">
            <span class="category-pill-icon">🔬</span>
            <span class="category-pill-name">AI Research</span>
          </a>
          <a href="/categories/tools" class="category-pill">
            <span class="category-pill-icon">🛠</span>
            <span class="category-pill-name">Tools &amp; Products</span>
          </a>
          <a href="/categories/business" class="category-pill">
            <span class="category-pill-icon">📈</span>
            <span class="category-pill-name">Business</span>
          </a>
          <a href="/categories/ethics" class="category-pill">
            <span class="category-pill-icon">⚖️</span>
            <span class="category-pill-name">Ethics &amp; Policy</span>
          </a>
          <a href="/categories/industry" class="category-pill">
            <span class="category-pill-icon">🏭</span>
            <span class="category-pill-name">Industry</span>
          </a>
          <a href="/categories/robotics" class="category-pill">
            <span class="category-pill-icon">🤖</span>
            <span class="category-pill-name">Robotics</span>
          </a>
        </div>
      </div>
    </section>

    <!-- Leaderboard ad slot, will be re-enabled once AdSense is approved -->
${renderLatest(articles)}${renderDeepDives(articles)}

    <!-- NEWSLETTER -->
    <section class="newsletter" id="newsletter">
      <div class="container">
        <div class="newsletter-inner">
          <div>
            <span class="newsletter-eyebrow">AI Glimpse Daily</span>
            <h2 class="newsletter-title">The AI news that matters, in five minutes.</h2>
            <p class="newsletter-subtitle">One email each morning. No hype, no fluff, just the stories that will shape your next week in AI.</p>
          </div>
          <form class="newsletter-form" novalidate>
            <label class="sr-only" for="newsletter-email">Email address</label>
            <div class="newsletter-input-group">
              <input type="email" id="newsletter-email" class="newsletter-input" placeholder="your@email.com" required>
              <button type="submit" class="newsletter-submit">Subscribe</button>
            </div>
            <p class="newsletter-note">Free forever. Unsubscribe in one click. We never sell your data.</p>
          </form>
        </div>
      </div>
    </section>
${renderMore(articles)}

  </main>

  <div id="site-footer-slot"></div>

  <script src="/js/chrome.js"></script>
  <script src="/js/main.js"></script>
</body>
</html>
`;
}

export async function buildHomepage() {
  let idx = { articles: [] };
  try { idx = JSON.parse(await fs.readFile(PUBLISHED_PATH, 'utf8')); }
  catch { /* no published.json yet, render empty state */ }
  const articles = idx.articles || [];
  const html = renderPage(articles);
  await fs.writeFile(OUTPUT_PATH, html);
  const placed = Math.min(15, articles.length);
  console.log(`  ✓ index.html rebuilt (${articles.length} articles in index, ${placed} placed on homepage)`);
  return { total: articles.length, placed };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  buildHomepage().catch(e => { console.error(e); process.exit(1); });
}
