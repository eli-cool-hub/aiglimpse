// AI image generation for article hero images.
//
// Uses Pollinations.ai (free, no API key, Flux model). Each article gets a unique
// 1200×630 image, deterministically seeded from the slug so:
//   • Identical builds produce identical images (idempotent)
//   • Two different articles can NEVER collide (seed = hash(slug))
//
// If generation fails for any reason, we fall back to the placeholder SVG.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(process.cwd());
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');
const FALLBACK = '/images/placeholder.svg';

// Visual style per category — keeps the brand coherent while giving each topic a flavor.
const CATEGORY_STYLE = {
  llms:     'abstract neural network with glowing data flows and interconnected nodes',
  research: 'minimalist scientific abstract concept, geometric shapes, technical diagram aesthetic',
  tools:    'modern product illustration, clean geometric composition, sleek tech aesthetic',
  business: 'abstract growth-and-finance illustration, geometric arrows and ascending lines',
  ethics:   'thoughtful philosophical illustration, scales of balance, abstract justice motif',
  industry: 'industrial automation concept, factory and machinery in abstract form',
  robotics: 'minimalist humanoid robot silhouette, futuristic mechanical concept'
};

const BASE_STYLE = 'editorial illustration, premium magazine cover, cinematic lighting, warm dark background with orange and amber highlights, minimalist composition, no text, no human faces';

const POLL_MODEL = 'flux';      // best free model on Pollinations
const POLL_WIDTH = 1200;
const POLL_HEIGHT = 630;

function buildPrompt(title, category) {
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE.tools;
  // Strip article-specific symbols & numbers that confuse image gen; keep nouns/themes.
  const themed = String(title || '')
    .replace(/["'""''']/g, '')
    .replace(/[—–]/g, '-')
    .replace(/\d+(\.\d+)?%?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${themed}. ${style}. ${BASE_STYLE}`;
}

export function seedFromSlug(slug) {
  const hash = crypto.createHash('sha256').update(String(slug)).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 1_000_000_000;
}

/**
 * Generate (or reuse) an article hero image.
 *
 * @param {string} slug      — article slug, also used as filename and seed source
 * @param {string} title     — article headline, used to derive the prompt
 * @param {string} category  — category slug (llms/research/tools/business/ethics/industry/robotics)
 * @returns {Promise<string>} — site-absolute URL of the image, e.g. /images/articles/foo.jpg
 */
export async function generateArticleImage(slug, title, category) {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const outPath = path.join(IMAGES_DIR, `${slug}.jpg`);
  const relPath = `/images/articles/${slug}.jpg`;

  // Idempotent: if we've already generated this image, reuse it.
  try {
    const stat = await fs.stat(outPath);
    if (stat.size > 5000) return relPath;
  } catch { /* not generated yet */ }

  const prompt = buildPrompt(title, category);
  const seed = seedFromSlug(slug);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${POLL_WIDTH}&height=${POLL_HEIGHT}&seed=${seed}&nologo=true&model=${POLL_MODEL}&enhance=true`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AI Glimpse Newsroom Bot/1.0 (+https://aiglimpse.ai)' },
      signal: AbortSignal.timeout(75000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) throw new Error('image too small (likely error response)');
    await fs.writeFile(outPath, buf);
    console.log(`    🎨 image generated (${(buf.length / 1024).toFixed(0)} KB)`);
    return relPath;
  } catch (e) {
    console.warn(`    ⚠ image generation failed (${e.message}); using placeholder`);
    return FALLBACK;
  }
}
