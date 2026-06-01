#!/usr/bin/env node
/**
 * Remove articles by slug: delete HTML/images, update published.json, rebuild site.
 * Usage: node scripts/unpublish-slugs.mjs slug-one slug-two ...
 */

import fs from 'fs/promises';
import path from 'path';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';
import { regenerateSitemap } from './lib/sitemap.mjs';
import { contentHash } from './lib/dedupe.mjs';

const ROOT = process.cwd();
const PUBLISHED_PATH = path.join(ROOT, 'data', 'published.json');
const SYNDICATED_PATH = path.join(ROOT, 'data', 'syndicated.json');
const ARTICLES_DIR = path.join(ROOT, 'articles');
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');
const SITE_URL = 'https://aiglimpse.ai';

const CATEGORIES = {
  llms: { name: 'LLMs & Chatbots' }, research: { name: 'AI Research' },
  tools: { name: 'AI Tools' }, business: { name: 'AI Business' },
  ethics: { name: 'Ethics & Policy' }, industry: { name: 'Industry' },
  robotics: { name: 'Robotics' }
};

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function regenerateRss(published) {
  const recent = published.articles.slice(0, 50);
  const rssItems = recent.map(a => `    <item>
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

const slugs = process.argv.slice(2);
if (!slugs.length) {
  console.error('Usage: node scripts/unpublish-slugs.mjs <slug> [...]');
  process.exit(1);
}

async function unlinkQuiet(p) {
  try { await fs.unlink(p); } catch {}
}

const published = JSON.parse(await fs.readFile(PUBLISHED_PATH, 'utf8'));
let syndicated = {};
try { syndicated = JSON.parse(await fs.readFile(SYNDICATED_PATH, 'utf8')); } catch {}

const removeSet = new Set(slugs);
const removedArticles = published.articles.filter(a => removeSet.has(a.slug));
const before = published.articles.length;
published.articles = published.articles.filter(a => !removeSet.has(a.slug));

const hashRemove = new Set(removedArticles.map(a => contentHash({ title: a.title })));
published.hashes = (published.hashes || []).filter(h => !hashRemove.has(h));

for (const slug of slugs) {
  await unlinkQuiet(path.join(ARTICLES_DIR, `${slug}.html`));
  await unlinkQuiet(path.join(IMAGES_DIR, `${slug}.jpg`));
  await unlinkQuiet(path.join(IMAGES_DIR, `${slug}.svg`));
  await unlinkQuiet(path.join(IMAGES_DIR, `${slug}-inline-1.jpg`));
  await unlinkQuiet(path.join(IMAGES_DIR, `${slug}-inline-2.jpg`));
  delete syndicated[slug];
  console.log(`  ✓ removed ${slug}`);
}

await fs.writeFile(PUBLISHED_PATH, JSON.stringify(published, null, 2) + '\n');
await fs.writeFile(SYNDICATED_PATH, JSON.stringify(syndicated, null, 2) + '\n');
await regenerateSitemap(published, SITE_URL, ROOT);
await regenerateRss(published);
await buildHomepage();
await buildCategories();

console.log(`\nUnpublished ${before - published.articles.length} articles (${published.articles.length} remain)`);
