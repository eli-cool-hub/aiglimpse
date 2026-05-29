#!/usr/bin/env node
// Heal already-published articles by injecting inline Pexels photos at H2
// boundaries. Skips articles that already contain `article-image--inline`,
// so safe to re-run. Does NOT touch Claude or rewrite article copy, only
// inserts <figure> tags into the existing body markup.
//
// Rules:
//   • Evergreens (data/published.json entry has evergreen: true): always 2 inline
//   • News articles with at least 3 H2s: 1 inline (longer pieces only)
//   • Otherwise: skip
//
// Required env: PEXELS_API_KEY (no key, script no-ops with a warning)

// Usage:
//   node scripts/heal-inline-images.mjs         , only articles missing inline images
//   node scripts/heal-inline-images.mjs --force   , replace existing inline images too

import fs from 'fs/promises';
import path from 'path';
import { generateInlineImages, injectInlineImages, resetImageSession } from './lib/images.mjs';

const ROOT = path.resolve(process.cwd());
const ARTICLES_DIR = path.join(ROOT, 'articles');
const DATA_PATH = path.join(ROOT, 'data', 'published.json');
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');
const FORCE = process.argv.includes('--force');

if (!process.env.PEXELS_API_KEY) {
  console.warn('⚠ PEXELS_API_KEY not set, nothing to heal.');
  process.exit(0);
}

const data = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
resetImageSession();

let touched = 0;
let skippedNoBody = 0;
let skippedAlreadyHasInline = 0;
let skippedTooShort = 0;

function parseArticleContext(html) {
  const subtitle = (html.match(/class="article-hero-subtitle"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]
    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const bodyMatch = html.match(/<div class="article-body">([\s\S]*?)<\/div>(\s*<!--|\s*<section|\s*<p style)/);
  return { subtitle, bodyHtml: bodyMatch?.[1] || '' };
}

async function stripInlineImages(html, slug) {
  let out = html.replace(/<figure class="article-image article-image--inline">[\s\S]*?<\/figure>\s*/g, '');
  for (let i = 1; i <= 3; i++) {
    try { await fs.unlink(path.join(IMAGES_DIR, `${slug}-inline-${i}.jpg`)); } catch {}
  }
  return out;
}

for (const article of data.articles) {
  const filePath = path.join(ARTICLES_DIR, `${article.slug}.html`);
  let html;
  try { html = await fs.readFile(filePath, 'utf8'); }
  catch { continue; }

  const hasInline = html.includes('article-image--inline');
  if (hasInline && !FORCE) {
    skippedAlreadyHasInline++;
    continue;
  }

  // The body block in our templates is exactly:
  //   <div class="article-body">...body html...</div>
  // followed by either an inline-ad comment, an FAQ section, or the source
  // attribution paragraph. We capture the body lazily up to the FIRST closing
  // </div> on its own line. Templates emit body_html on a single line, so
  // matching the wrapper shape is reliable.
  const bodyRe = /<div class="article-body">([\s\S]*?)<\/div>(\s*<!--|\s*<section|\s*<p style)/;
  const m = html.match(bodyRe);
  if (!m) { skippedNoBody++; continue; }

  const bodyHtml = m[1];
  const h2Count = (bodyHtml.match(/<h2\b/gi) || []).length;
  const wordCount = bodyHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

  let imageCount = 0;
  if (article.evergreen) imageCount = 2;
  else if (h2Count >= 3 && wordCount >= 500) imageCount = 1;

  if (!imageCount) { skippedTooShort++; continue; }

  const ctx = parseArticleContext(html);
  const imageOpts = {
    title: article.title,
    subtitle: ctx.subtitle,
    keywords: [],
    bodyHtml: FORCE ? await stripInlineImages(bodyHtml, article.slug) : bodyHtml,
    category: article.category
  };

  const inline = await generateInlineImages(article.slug, imageOpts, null, imageCount);
  if (!inline.length) { skippedTooShort++; continue; }

  const newBody = injectInlineImages(imageOpts.bodyHtml, inline);
  if (newBody === imageOpts.bodyHtml) { skippedTooShort++; continue; }

  // Reassemble with the original wrapper; everything outside our captured group
  // stays byte-identical so we don't perturb other markup.
  const before = html.slice(0, m.index);
  const tail = html.slice(m.index + m[0].length - m[2].length); // keep the lookahead match
  const replaced = before + `<div class="article-body">${newBody}</div>` + tail;
  await fs.writeFile(filePath, replaced);
  touched++;
  console.log(`  ✓ ${article.slug} (${imageCount} inline, ${h2Count} H2s, ${wordCount}w)`);
}

console.log(`\nDone. Healed ${touched}, skipped ${skippedAlreadyHasInline} already-imaged, ${skippedTooShort} short, ${skippedNoBody} no body match.`);
