#!/usr/bin/env node
// One-shot migration for pages published before the 2026-07 site upgrade.
// New pages get all of this from their templates; this backfills the archive.
//
// For every article page and static page:
//   1. Replace the empty #site-header-slot / #site-footer-slot divs with the
//      static header/footer markup (fixes CLS + exposes nav links to crawlers).
//   2. Swap the CSS-@import font chain for direct <link> font loading.
// Articles additionally get:
//   3. <picture>/WebP markup for hero + inline images, hero preload hint.
//   4. BreadcrumbList JSON-LD.
//   5. A "More from AI Glimpse" related-articles section.
//
// Idempotent: pages already carrying static chrome are skipped.
// Run: node scripts/migrate-site-upgrade.mjs

import fs from 'fs/promises';
import path from 'path';
import { headerHtml, footerHtml, FONT_LINKS } from './lib/chrome.mjs';
import { webpUrl, heroPreload } from './lib/media.mjs';
import { relatedSectionHtml, breadcrumbSchema } from './lib/related.mjs';

const ROOT = path.resolve(process.cwd());
const SITE_URL = process.env.SITE_URL || 'https://aiglimpse.ai';

const CATEGORY_NAMES = {
  llms: 'LLMs & Chatbots', research: 'AI Research', tools: 'AI Tools & Products',
  business: 'AI Business', ethics: 'Ethics & Policy', industry: 'Industry Applications',
  robotics: 'Robotics'
};

const HEADER_SLOT = /<div id="site-header-slot"><\/div>/;
const FOOTER_SLOT = /<div id="site-footer-slot"><\/div>/;
const PRECONNECT_BLOCK = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*\n\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/;
const CSS_LINK = '<link rel="stylesheet" href="/css/main.css">';

async function fileExists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

// Wrap article JPG imgs in <picture> with a WebP source (only when the webp
// sibling actually exists on disk).
async function webpifyImages(html) {
  const re = /<img ([^>]*?)src="(\/images\/articles\/[^"]+\.jpe?g)"([^>]*?)>/g;
  const matches = [...html.matchAll(re)];
  for (const m of matches.reverse()) {
    const [full, pre, src, post] = m;
    const webp = webpUrl(src);
    if (!webp || !(await fileExists(path.join(ROOT, webp.slice(1))))) continue;
    const isHero = /loading="eager"/.test(full);
    const img = `<img ${pre}src="${src}"${post}${isHero && !/fetchpriority/.test(full) ? ' fetchpriority="high"' : ''}>`.replace(/\s+>/, '>');
    const picture = `<picture><source srcset="${webp}" type="image/webp">${img}</picture>`;
    html = html.slice(0, m.index) + picture + html.slice(m.index + full.length);
  }
  return html;
}

function swapChrome(html, activePath = '') {
  html = html.replace(HEADER_SLOT, headerHtml(activePath));
  html = html.replace(FOOTER_SLOT, footerHtml());
  return html;
}

function swapFonts(html) {
  if (html.includes('fonts.googleapis.com/css2')) return html; // already has a font link
  if (PRECONNECT_BLOCK.test(html)) return html.replace(PRECONNECT_BLOCK, FONT_LINKS);
  return html.replace(CSS_LINK, `${FONT_LINKS}\n  ${CSS_LINK}`);
}

async function migrateArticle(file, published, bySlug) {
  const slug = path.basename(file, '.html');
  let html = await fs.readFile(file, 'utf8');
  if (html.includes('class="site-header"')) return false; // already migrated

  const entry = bySlug.get(slug);
  const category = entry?.category
    || (html.match(/href="\/categories\/(\w+)"/) || [])[1]
    || 'tools';
  const title = entry?.title
    || (html.match(/<h1 class="article-hero-title">([\s\S]*?)<\/h1>/) || [])[1]?.trim()
    || slug;

  html = swapFonts(html);
  html = swapChrome(html);
  html = await webpifyImages(html);

  // Preload the hero image (first eager article image).
  const heroSrc = (html.match(/<img [^>]*src="(\/images\/articles\/[^"]+)"[^>]*loading="eager"/) || [])[1];
  if (heroSrc && !html.includes('rel="preload" as="image"')) {
    html = html.replace(CSS_LINK, `${CSS_LINK}\n  ${heroPreload(heroSrc)}`);
  }

  // BreadcrumbList JSON-LD.
  if (!html.includes('"BreadcrumbList"')) {
    const crumbs = breadcrumbSchema(SITE_URL, {
      slug, category,
      categoryName: CATEGORY_NAMES[category] || category,
      title: title.replace(/<[^>]+>/g, '')
    });
    html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(crumbs)}</script>\n</head>`);
  }

  // Related articles module between </article> and </main>.
  if (!html.includes('aria-label="Related articles"')) {
    const related = relatedSectionHtml(published, { slug, category });
    if (related) {
      html = html.replace(/<\/article>\s*<\/main>/, `</article>\n    ${related}\n  </main>`);
    }
  }

  await fs.writeFile(file, html);
  return true;
}

async function migrateStatic(file, activePath = '') {
  let html = await fs.readFile(file, 'utf8');
  if (html.includes('class="site-header"')) return false;
  if (!HEADER_SLOT.test(html)) return false; // page without site chrome
  html = swapFonts(html);
  html = swapChrome(html, activePath);
  await fs.writeFile(file, html);
  return true;
}

async function main() {
  const published = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'published.json'), 'utf8'));
  const bySlug = new Map((published.articles || []).map(a => [a.slug, a]));

  const articlesDir = path.join(ROOT, 'articles');
  const articleFiles = (await fs.readdir(articlesDir)).filter(f => f.endsWith('.html'));
  let migrated = 0;
  for (const f of articleFiles) {
    if (await migrateArticle(path.join(articlesDir, f), published, bySlug)) migrated++;
  }
  console.log(`✓ articles: ${migrated}/${articleFiles.length} migrated`);

  const pagesDir = path.join(ROOT, 'pages');
  const staticFiles = (await fs.readdir(pagesDir)).filter(f => f.endsWith('.html')).map(f => path.join(pagesDir, f));
  staticFiles.push(path.join(ROOT, '404.html'), path.join(ROOT, 'search.html'));
  let staticMigrated = 0;
  for (const f of staticFiles) {
    if (await fileExists(f) && await migrateStatic(f)) staticMigrated++;
  }
  console.log(`✓ static pages: ${staticMigrated}/${staticFiles.length} migrated`);
}

main().catch(e => { console.error(e); process.exit(1); });
