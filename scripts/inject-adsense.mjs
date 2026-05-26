#!/usr/bin/env node
// One-shot utility to inject the Google AdSense verification snippet into the
// <head> of every existing static HTML file (articles, pages, 404).
//
// Idempotent: skips files that already contain "adsbygoogle.js".
//
// Future articles automatically get the snippet because the templates in
// fetch-and-publish.mjs, build-homepage.mjs, and build-categories.mjs all
// include it inline. This script only patches the historical files.

import fs from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const SNIPPET = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4263484717830850" crossorigin="anonymous"></script>';
const MARKER = 'adsbygoogle.js';

const TARGET_DIRS = ['articles', 'pages', 'categories'];
const TARGET_FILES = ['404.html'];

async function listHtml(dir) {
  try {
    const entries = await fs.readdir(path.join(ROOT, dir));
    return entries.filter(e => e.endsWith('.html')).map(e => path.join(dir, e));
  } catch { return []; }
}

let patched = 0;
let skipped = 0;
const all = [
  ...(await Promise.all(TARGET_DIRS.map(listHtml))).flat(),
  ...TARGET_FILES
];

for (const rel of all) {
  const file = path.join(ROOT, rel);
  let html;
  try { html = await fs.readFile(file, 'utf8'); }
  catch { continue; }

  if (html.includes(MARKER)) { skipped++; continue; }

  // Inject just before </head>. If no </head> (shouldn't happen), skip safely.
  const idx = html.indexOf('</head>');
  if (idx === -1) { skipped++; continue; }

  const before = html.slice(0, idx);
  const after = html.slice(idx);
  const insert = `  ${SNIPPET}\n`;
  const next = before + insert + after;

  await fs.writeFile(file, next);
  patched++;
  console.log(`  + ${rel}`);
}

console.log(`\nInjected AdSense into ${patched} file(s), skipped ${skipped} (already had it or no </head>).`);
