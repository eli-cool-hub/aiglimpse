#!/usr/bin/env node
/**
 * Clears data/published.json, use this before going live to wipe any demo data
 * seeded via `npm run seed-demo`. Also rebuilds index.html to reflect the empty state.
 */

import fs from 'fs/promises';
import path from 'path';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

const PUBLISHED_PATH = path.join(path.resolve(process.cwd()), 'data', 'published.json');

async function main() {
  await fs.mkdir(path.dirname(PUBLISHED_PATH), { recursive: true });
  await fs.writeFile(PUBLISHED_PATH, JSON.stringify({ articles: [], hashes: [] }, null, 2));
  console.log('✓ data/published.json reset to empty');
  await buildHomepage();
  await buildCategories();
  console.log('  Homepage and category pages will show empty-state placeholders until the first pipeline run.');
}

main().catch(e => { console.error(e); process.exit(1); });
