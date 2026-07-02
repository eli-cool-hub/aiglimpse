#!/usr/bin/env node
// Builds /guides.html — hub page linking all evergreen explainers.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { EVERGREEN_TOPICS } from './lib/evergreen-topics.mjs';
import { headerHtml, footerHtml, FONT_LINKS } from './lib/chrome.mjs';
import { pictureHtml } from './lib/media.mjs';

const ROOT = process.cwd();
const PUBLISHED_PATH = path.join(ROOT, 'data', 'published.json');
const OUT = path.join(ROOT, 'guides.html');
const SITE = 'https://aiglimpse.ai';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function buildGuidesPage() {
  const published = JSON.parse(await fs.readFile(PUBLISHED_PATH, 'utf8'));
  const live = published.articles.filter(a => a.evergreen);
  const topicBySlug = Object.fromEntries(EVERGREEN_TOPICS.map(t => [t.slug, t]));

  const cards = live.map(a => {
    const topic = topicBySlug[a.slug];
    const href = `/articles/${a.slug}`;
    return `<article class="card card--large">
    <a href="${href}"><div class="card-image">${pictureHtml(a.image || '/images/placeholder.svg', a.title, { loading: 'lazy' })}</div></a>
    <div class="card-meta">
      <span class="tag tag--research">Explainer</span>
      <span class="card-byline">${new Date(a.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
    </div>
    <a href="${href}"><h2 class="card-title">${escapeHtml(a.title)}</h2></a>
    <p class="card-excerpt">${escapeHtml(a.subtitle || topic?.intent?.slice(0, 160) || '')}</p>
  </article>`;
  }).join('\n          ');

  const upcoming = EVERGREEN_TOPICS
    .filter(t => !live.some(a => a.slug === t.slug))
    .slice(0, 6)
    .map(t => `<li>${escapeHtml(t.title_seed)}</li>`)
    .join('\n            ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Explainers & Guides | AI Glimpse</title>
  <meta name="description" content="Long-form evergreen guides on RAG, AI agents, LLMs, security, and production AI. Updated weekly.">
  <link rel="canonical" href="${SITE}/guides.html">
  <meta property="og:title" content="AI Explainers & Guides | AI Glimpse">
  <meta property="og:description" content="Long-form evergreen guides on RAG, AI agents, LLMs, and production AI.">
  <meta property="og:url" content="${SITE}/guides.html">
  ${FONT_LINKS}
  <link rel="stylesheet" href="/css/main.css">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'AI Explainers & Guides',
    url: `${SITE}/guides.html`,
    isPartOf: { '@type': 'WebSite', name: 'AI Glimpse', url: `${SITE}/` }
  })}</script>
  <meta name="google-site-verification" content="B132aMlqf1nssWYhjOSKUgSjmfwNWgPgtozZsHDxWlU" />
</head>
<body>
  ${headerHtml('/guides.html')}
  <main>
    <section class="section">
      <div class="container">
        <div class="section-header">
          <h1 class="section-title">AI Explainers & Guides</h1>
          <p style="color:var(--color-ink-muted);max-width:640px;margin:0;">Cornerstone guides on the topics that matter for production AI. We publish a new explainer every week.</p>
        </div>
        <div class="grid grid-2">
          ${cards || '<p>No guides published yet.</p>'}
        </div>
        ${upcoming ? `<div style="margin-top:var(--space-8);padding-top:var(--space-6);border-top:1px solid var(--color-rule);">
          <h2 class="section-title" style="font-size:var(--text-lg);">Coming soon</h2>
          <ul style="color:var(--color-ink-muted);line-height:1.7;">${upcoming}</ul>
        </div>` : ''}
      </div>
    </section>
  </main>
  ${footerHtml()}
  <script src="/js/chrome.js"></script>
  <script src="/js/main.js"></script>
</body>
</html>`;

  await fs.writeFile(OUT, html);
  console.log(`  ✓ guides.html rebuilt (${live.length} explainers)`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  buildGuidesPage().catch(e => { console.error(e); process.exit(1); });
}
