#!/usr/bin/env node
// Builds /search-index.json from data/published.json: a compact list of
// every article (slug, title, subtitle, category, date) consumed by the
// client-side search on /search.html.
//
// Lives at the site root (not /data/, which robots.txt disallows) so the
// browser fetch is never blocked by crawler rules or future tightening.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(process.cwd());
const PUBLISHED_PATH = path.join(ROOT, 'data', 'published.json');
const OUT = path.join(ROOT, 'search-index.json');

export async function buildSearchIndex() {
  let idx = { articles: [] };
  try { idx = JSON.parse(await fs.readFile(PUBLISHED_PATH, 'utf8')); }
  catch { /* no published.json yet */ }

  const items = (idx.articles || []).map(a => ({
    s: a.slug,
    t: a.title,
    d: a.subtitle || '',
    c: a.category,
    p: a.publishedAt
  }));

  await fs.writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), items }));
  console.log(`  ✓ search-index.json rebuilt (${items.length} articles)`);
  return items.length;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  buildSearchIndex().catch(e => { console.error(e); process.exit(1); });
}
