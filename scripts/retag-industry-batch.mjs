#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { retagArticle } from './lib/retag-category.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

const SLUGS = [
  'boston-childrens-deploys-ai-to-identify-dozens-of-rare-diseases-58d96d4a',
  'openai-unveils-rosalind-biodefense-program-for-public-health-ai-76d2e551'
];

const published = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data/published.json'), 'utf8'));
for (const slug of SLUGS) {
  const r = await retagArticle(slug, 'industry', published);
  console.log(r.changed ? `✓ ${slug}: ${r.from} → industry` : `· ${slug}: already industry`);
}
await fs.writeFile(path.join(process.cwd(), 'data/published.json'), JSON.stringify(published, null, 2) + '\n');
await buildHomepage();
await buildCategories();
console.log('✓ Homepage + category pages rebuilt');
