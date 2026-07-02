#!/usr/bin/env node
// Heal articles whose hero image fell back to something less ideal in earlier runs.
//
// Targets:
//   1. /images/placeholder.svg (the very first generic fallback)
//   2. /images/articles/<slug>.svg (the branded SVG card, generated when AI services
//      were unavailable). Once a real Pexels key is set, we can swap these for real
//      topical photos.
//
// Usage:
//   node scripts/heal-images.mjs              , only heal generic placeholders
//   node scripts/heal-images.mjs --svg        , also re-attempt SVG-fallback articles
//   node scripts/heal-images.mjs --refresh      , re-pick Pexels hero for ALL .jpg articles
//                                                using improved article-specific queries

import fs from 'fs/promises';
import path from 'path';
import { generateArticleImage, resetImageSession } from './lib/images.mjs';
import { webpUrl } from './lib/media.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

const ROOT = path.resolve(process.cwd());
const DATA_PATH = path.join(ROOT, 'data', 'published.json');
const ARTICLES_DIR = path.join(ROOT, 'articles');
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');
const PLACEHOLDER = '/images/placeholder.svg';
const HEAL_SVG = process.argv.includes('--svg');
const REFRESH = process.argv.includes('--refresh');

function parseArticleContext(html) {
  const subtitle = (html.match(/class="article-hero-subtitle"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]
    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const bodyMatch = html.match(/<div class="article-body">([\s\S]*?)<\/div>(\s*<!--|\s*<section|\s*<p style)/);
  return { subtitle, bodyHtml: bodyMatch?.[1] || '' };
}

async function rewriteArticleHtml(slug, oldUrl, newUrl) {
  const file = path.join(ARTICLES_DIR, `${slug}.html`);
  try {
    let html = await fs.readFile(file, 'utf8');
    if (!html.includes(oldUrl)) return false;
    // Update the WebP <source srcset> sibling too, so <picture> markup
    // never points at a stale/deleted .webp.
    const oldWebp = webpUrl(oldUrl);
    const newWebp = webpUrl(newUrl);
    if (oldWebp) {
      if (newWebp) html = html.split(oldWebp).join(newWebp);
      else html = html.replace(new RegExp(`<source srcset="${oldWebp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" type="image/webp">`, 'g'), '');
    }
    html = html.split(oldUrl).join(newUrl);
    await fs.writeFile(file, html);
    return true;
  } catch (e) {
    console.warn(`  ⚠ could not rewrite ${slug}.html: ${e.message}`);
    return false;
  }
}

const raw = await fs.readFile(DATA_PATH, 'utf8');
const data = JSON.parse(raw);

const targets = REFRESH
  ? data.articles.filter(a => typeof a.image === 'string' && a.image.endsWith('.jpg'))
  : data.articles.filter(a => {
      if (a.image === PLACEHOLDER) return true;
      if (HEAL_SVG && typeof a.image === 'string' && a.image.endsWith('.svg') && a.image.startsWith('/images/articles/')) return true;
      return false;
    });

if (!targets.length) {
  console.log(REFRESH ? 'Nothing to refresh: no articles with Pexels hero images.' : 'Nothing to heal: all articles already have proper images.');
  process.exit(0);
}

console.log(`\n${REFRESH ? 'Refreshing' : 'Healing'} ${targets.length} article(s)${HEAL_SVG ? ' (including SVG fallbacks)' : ''}...\n`);
resetImageSession();

for (const a of targets) {
  const oldUrl = a.image;
  const htmlPath = path.join(ARTICLES_DIR, `${a.slug}.html`);
  let html = '';
  try { html = await fs.readFile(htmlPath, 'utf8'); } catch {}

  if (REFRESH && oldUrl.endsWith('.jpg')) {
    try { await fs.unlink(path.join(IMAGES_DIR, path.basename(oldUrl))); } catch {}
    try { await fs.unlink(path.join(IMAGES_DIR, path.basename(oldUrl).replace(/\.jpg$/, '.webp'))); } catch {}
  }
  if (HEAL_SVG && oldUrl !== PLACEHOLDER && oldUrl.endsWith('.svg')) {
    try { await fs.unlink(path.join(IMAGES_DIR, path.basename(oldUrl))); } catch {}
  }

  const ctx = parseArticleContext(html);
  const imageOpts = {
    title: a.title,
    subtitle: ctx.subtitle,
    keywords: [],
    bodyHtml: ctx.bodyHtml,
    category: a.category,
    force: (HEAL_SVG && oldUrl.endsWith('.svg')) || REFRESH
  };
  const newUrl = await generateArticleImage(a.slug, imageOpts);
  if (newUrl === oldUrl) {
    console.log(`  = ${a.slug}: unchanged (${newUrl})`);
    continue;
  }
  a.image = newUrl;
  const rewrote = await rewriteArticleHtml(a.slug, oldUrl, newUrl);
  console.log(`  ✓ ${a.slug}: ${newUrl}${rewrote ? '' : ' (html not updated, file missing?)'}`);
}

await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
console.log('\nRebuilding homepage and categories...');
await buildHomepage();
await buildCategories();
console.log('\nDone.\n');
