#!/usr/bin/env node
// Heal articles that fell back to /images/placeholder.svg in earlier pipeline runs.
//
// Reads data/published.json, finds every article whose `image` points at the generic
// placeholder, regenerates a proper image via lib/images.mjs (which now uses turbo+flux
// with a branded SVG fallback), updates published.json, rewrites the article HTML to
// reference the new image, then rebuilds the homepage and category pages.
//
// Idempotent: safe to run any time. Only touches articles still using the placeholder.

import fs from 'fs/promises';
import path from 'path';
import { generateArticleImage } from './lib/images.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

const ROOT = path.resolve(process.cwd());
const DATA_PATH = path.join(ROOT, 'data', 'published.json');
const ARTICLES_DIR = path.join(ROOT, 'articles');
const PLACEHOLDER = '/images/placeholder.svg';

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
const targets = data.articles.filter(a => a.image === PLACEHOLDER);

if (!targets.length) {
  console.log('Nothing to heal: all articles already have proper images.');
  process.exit(0);
}

console.log(`\nHealing ${targets.length} article(s) with placeholder images...\n`);

for (const a of targets) {
  const newUrl = await generateArticleImage(a.slug, a.title, a.category);
  if (newUrl === PLACEHOLDER) {
    console.log(`  ⚠ ${a.slug}: still failed`);
    continue;
  }
  a.image = newUrl;
  const rewrote = await rewriteArticleHtml(a.slug, PLACEHOLDER, newUrl);
  console.log(`  ✓ ${a.slug}: ${newUrl}${rewrote ? '' : ' (html not updated, file missing?)'}`);
}

await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
console.log('\nRebuilding homepage and categories...');
await buildHomepage();
await buildCategories();
console.log('\nDone.\n');
