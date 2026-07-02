// Responsive image helpers: WebP generation (via sharp) and <picture>
// markup. Article images are stored as JPG (Pexels download) plus a
// same-name .webp sibling; HTML uses <picture> so modern browsers get
// the ~70% smaller WebP while the JPG remains the universal fallback.

import fs from 'fs/promises';
import path from 'path';

const WEBP_QUALITY = 78;
const MAX_WIDTH = 1200;

let _sharp;
async function getSharp() {
  if (_sharp === undefined) {
    try {
      _sharp = (await import('sharp')).default;
    } catch {
      _sharp = null;
      console.warn('    ! sharp not installed, skipping WebP generation');
    }
  }
  return _sharp;
}

/** URL of the WebP sibling for a JPG article image, or null if not applicable. */
export function webpUrl(src) {
  if (typeof src === 'string' && /^\/images\/.+\.jpe?g$/i.test(src)) {
    return src.replace(/\.jpe?g$/i, '.webp');
  }
  return null;
}

/**
 * Ensure a .webp sibling exists for the given absolute JPG path.
 * Resizes down to MAX_WIDTH. No-op if webp already exists or sharp missing.
 * Pass { force: true } after writing a new JPG so a stale sibling never survives.
 */
export async function ensureWebp(absJpgPath, { force = false } = {}) {
  const sharp = await getSharp();
  if (!sharp) return null;
  const out = absJpgPath.replace(/\.jpe?g$/i, '.webp');
  if (!force) {
    try {
      await fs.stat(out);
      return out; // already there
    } catch {}
  }
  try {
    await sharp(absJpgPath)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(out);
    return out;
  } catch (e) {
    console.warn(`    ! webp failed for ${path.basename(absJpgPath)}: ${e.message}`);
    return null;
  }
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render an <img> wrapped in <picture> with a WebP source when the src is a
 * site JPG. SVG/placeholder images render as a plain <img>.
 */
export function pictureHtml(src, alt, { loading = 'lazy', fetchpriority = null, width = 1200, height = 630 } = {}) {
  const attrs = [
    `src="${escapeAttr(src)}"`,
    `alt="${escapeAttr(alt)}"`,
    `loading="${loading}"`,
    fetchpriority ? `fetchpriority="${fetchpriority}"` : '',
    `width="${width}"`,
    `height="${height}"`
  ].filter(Boolean).join(' ');
  const img = `<img ${attrs}>`;
  const webp = webpUrl(src);
  if (!webp) return img;
  return `<picture><source srcset="${escapeAttr(webp)}" type="image/webp">${img}</picture>`;
}

/** Preload hint for an article's LCP hero image (WebP variant when available). */
export function heroPreload(src) {
  const webp = webpUrl(src);
  if (webp) return `<link rel="preload" as="image" href="${escapeAttr(webp)}" type="image/webp" fetchpriority="high">`;
  if (src) return `<link rel="preload" as="image" href="${escapeAttr(src)}" fetchpriority="high">`;
  return '';
}
