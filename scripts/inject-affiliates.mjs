#!/usr/bin/env node
// Insert affiliate boxes into already-published commercial evergreen pages.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadAffiliateConfig,
  affiliateBoxHtml,
  affiliateDisclosureHtml
} from './lib/affiliates.mjs';

const ROOT = process.cwd();
const config = await loadAffiliateConfig();
const slugs = Object.keys(config.by_slug || {});
let changed = 0;

for (const slug of slugs) {
  const file = path.join(ROOT, 'articles', `${slug}.html`);
  let html;
  try {
    html = await fs.readFile(file, 'utf8');
  } catch {
    continue;
  }
  if (html.includes('affiliate-box')) continue;

  const box = affiliateBoxHtml(slug, config);
  const note = affiliateDisclosureHtml(slug, config);
  if (!box) continue;

  if (html.includes('<div class="article-body">')) {
    html = html.replace('<div class="article-body">', `<div class="article-body">\n${box}\n`);
  } else {
    continue;
  }
  if (note && !html.includes('affiliate-footer')) {
    html = html.replace(
      '<p style="font-size:var(--text-xs);color:var(--color-ink-faint);margin-top:var(--space-6);',
      `${note}\n          <p style="font-size:var(--text-xs);color:var(--color-ink-faint);margin-top:var(--space-6);`
    );
  }
  await fs.writeFile(file, html);
  changed++;
  console.log(`  ✓ ${slug}`);
}

console.log(`Injected affiliate boxes into ${changed} evergreen page(s)`);
