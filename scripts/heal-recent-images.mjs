#!/usr/bin/env node
// Re-fetch hero (+ inline) images for articles published in the last N days.
// Usage: node scripts/heal-recent-images.mjs [--days 10] [--force]

import fs from 'fs/promises';
import path from 'path';
import { generateArticleImage, generateInlineImages, injectInlineImages, resetImageSession } from './lib/images.mjs';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

const ROOT = process.cwd();
const DAYS = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--days') || '10', 10);
const FORCE = !process.argv.includes('--no-force');

if (!process.env.PEXELS_API_KEY) {
  console.error('PEXELS_API_KEY required');
  process.exit(1);
}

const data = JSON.parse(await fs.readFile(path.join(ROOT, 'data/published.json'), 'utf8'));
const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;
const recent = data.articles.filter(a => new Date(a.publishedAt).getTime() >= cutoff);
resetImageSession();

function parseCtx(html) {
  const title = (html.match(/<h1 class="article-hero-title">([\s\S]*?)<\/h1>/i) || [])[1]
    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const subtitle = (html.match(/class="article-hero-subtitle"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]
    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const bodyMatch = html.match(/<div class="article-body">([\s\S]*?)<\/div>(\s*<!--|\s*<section|\s*<p style)/);
  const kw = (html.match(/<meta name="keywords" content="([^"]*)">/i) || [])[1] || '';
  return {
    title,
    subtitle,
    keywords: kw.split(',').map(s => s.trim()).filter(Boolean),
    bodyHtml: bodyMatch?.[1] || ''
  };
}

function setHeroInHtml(html, imagePath, alt) {
  let next = html.replace(
    /(<figure class="article-image">[\s\S]*?<img[^>]*\ssrc=")[^"]+(")/,
    `$1${imagePath}$2`
  );
  next = next.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="https://aiglimpse.ai${imagePath}">`);
  next = next.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="https://aiglimpse.ai${imagePath}">`);
  if (alt) {
    next = next.replace(
      /(<figure class="article-image">[\s\S]*?<img[^>]*\salt=")[^"]*(")/,
      `$1${alt.replace(/"/g, '&quot;')}$2`
    );
  }
  return next;
}

let heroes = 0;
let inlines = 0;

for (const article of recent) {
  const filePath = path.join(ROOT, 'articles', `${article.slug}.html`);
  let html;
  try { html = await fs.readFile(filePath, 'utf8'); } catch { continue; }

  const ctx = parseCtx(html);
  const imageOpts = { ...ctx, category: article.category };

  if (FORCE) {
    html = html.replace(/<figure class="article-image article-image--inline">[\s\S]*?<\/figure>\s*/g, '');
    for (const suffix of ['-inline-1', '-inline-2']) {
      try { await fs.unlink(path.join(ROOT, 'images/articles', `${article.slug}${suffix}.jpg`)); } catch {}
    }
  }

  const imagePath = await generateArticleImage(article.slug, { ...imageOpts, force: FORCE });
  let dirty = false;
  if (imagePath && imagePath !== article.image) {
    article.image = imagePath;
    dirty = true;
    heroes++;
  }
  const nextHero = setHeroInHtml(html, imagePath || article.image, ctx.title);
  if (nextHero !== html) {
    html = nextHero;
    dirty = true;
  }

  const h2Count = (html.match(/<h2\b/gi) || []).length;
  const wordCount = (html.match(/<div class="article-body">([\s\S]*?)<\/div>/) || [])[1]
    ?.replace(/<[^>]+>/g, ' ').split(/\s+/).length || 0;
  if (h2Count >= 3 && wordCount >= 500) {
    const inline = await generateInlineImages(article.slug, imageOpts, null, FORCE ? 1 : 0);
    const withInline = injectInlineImages(html, inline);
    if (withInline !== html) {
      html = withInline;
      dirty = true;
      inlines++;
    }
  }

  if (dirty) await fs.writeFile(filePath, html);
}

await fs.writeFile(path.join(ROOT, 'data/published.json'), JSON.stringify(data, null, 2) + '\n');
await buildHomepage();
await buildCategories();
console.log(`✓ Healed ${recent.length} recent articles (${DAYS}d): ${heroes} heroes, ${inlines} inline updates`);
