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
//                                                (use after setting PEXELS_API_KEY)

import fs from 'fs/promises';
import path from 'path';
import { generateArticleImage, resetImageSession } from './lib/images.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

const ROOT = path.resolve(process.cwd());
const DATA_PATH = path.join(ROOT, 'data', 'published.json');
const ARTICLES_DIR = path.join(ROOT, 'articles');
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');
const PLACEHOLDER = '/images/placeholder.svg';
const HEAL_SVG = process.argv.includes('--svg');

async function rewriteArticleHtml(slug, oldUrl, newUrl) {
  const file = path.join(ARTICLES_DIR, `${slug}.html`);
  try {
    let html = await fs.readFile(file, 'utf8');
    if (!html.includes(oldUrl)) return false;
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

const targets = data.articles.filter(a => {
  if (a.image === PLACEHOLDER) return true;
  if (HEAL_SVG && typeof a.image === 'string' && a.image.endsWith('.svg') && a.image.startsWith('/images/articles/')) return true;
  return false;
});

if (!targets.length) {
  console.log('Nothing to heal: all articles already have proper images.');
  process.exit(0);
}

console.log(`\nHealing ${targets.length} article(s)${HEAL_SVG ? ' (including SVG fallbacks)' : ''}...\n`);
resetImageSession();

for (const a of targets) {
  const oldUrl = a.image;
  // When re-healing SVG fallbacks, we have to delete the existing .svg first so the
  // generator does not short-circuit on the idempotency check.
  if (HEAL_SVG && oldUrl !== PLACEHOLDER && oldUrl.endsWith('.svg')) {
    const oldFile = path.join(IMAGES_DIR, path.basename(oldUrl));
    try { await fs.unlink(oldFile); } catch {}
  }
  const newUrl = await generateArticleImage(a.slug, a.title, a.category);
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
