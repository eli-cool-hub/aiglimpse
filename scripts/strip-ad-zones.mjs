// One-off cleanup: remove every legacy <div class="ad-zone ...">...</div>
// from already-published HTML files. Future builds never emit these because
// the build templates were updated. This script is idempotent, safe to re-run.
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const ROOT = path.resolve('.');
const TARGET_DIRS = [ROOT, path.join(ROOT, 'articles'), path.join(ROOT, 'categories')];

// Match a single ad-zone div, with or without inner span/comment content,
// and regardless of any extra attributes (style, data-*, etc.) after class.
const AD_ZONE_RE = /\s*<div\b[^>]*\bclass="[^"]*\bad-zone\b[^"]*"[^>]*>[\s\S]*?<\/div>\s*/g;
// Also strip leftover comment markers that wrap the homepage's old ad block.
const LEADERBOARD_WRAPPER_RE = /\s*<!-- Leaderboard ad -->\s*<div class="container">\s*<\/div>\s*/g;

let touched = 0;
let total = 0;

async function processFile(filePath) {
  if (!filePath.endsWith('.html')) return;
  total++;
  const original = await readFile(filePath, 'utf8');
  let next = original.replace(AD_ZONE_RE, '\n');
  next = next.replace(LEADERBOARD_WRAPPER_RE, '\n');
  if (next !== original) {
    await writeFile(filePath, next);
    touched++;
    console.log(`✓ stripped ad-zone from ${path.relative(ROOT, filePath)}`);
  }
}

async function walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      await processFile(path.join(dir, entry.name));
    }
  }
}

for (const dir of TARGET_DIRS) {
  try {
    await walkDir(dir);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

console.log(`\nDone. Touched ${touched} of ${total} HTML files.`);
