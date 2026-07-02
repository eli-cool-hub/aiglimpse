#!/usr/bin/env node
// One-shot + maintenance image optimizer.
//
// For every JPG under images/articles/:
//   1. If the JPG is oversized (wider than 1200px or heavier than 250 KB),
//      re-encode it in place at width<=1200, quality 80 (mozjpeg). The URL
//      stays the same so nothing else needs to change.
//   2. Generate a same-name .webp sibling (width<=1200, quality 78) used by
//      the <picture> markup in article/card templates.
//
// Idempotent: skips JPGs already small enough and existing .webp files.
// Run: npm run optimize-images

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');
const MAX_WIDTH = 1200;
const JPG_RECODE_BYTES = 250 * 1024;
const JPG_QUALITY = 80;
const WEBP_QUALITY = 78;

async function main() {
  const files = (await fs.readdir(IMAGES_DIR)).filter(f => /\.jpe?g$/i.test(f));
  let recoded = 0, webped = 0, savedBytes = 0;

  for (const file of files) {
    const jpgPath = path.join(IMAGES_DIR, file);
    const webpPath = jpgPath.replace(/\.jpe?g$/i, '.webp');

    try {
      const stat = await fs.stat(jpgPath);
      const meta = await sharp(jpgPath).metadata();

      if (stat.size > JPG_RECODE_BYTES || (meta.width || 0) > MAX_WIDTH) {
        const buf = await sharp(jpgPath)
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: JPG_QUALITY, mozjpeg: true })
          .toBuffer();
        if (buf.length < stat.size) {
          await fs.writeFile(jpgPath, buf);
          savedBytes += stat.size - buf.length;
          recoded++;
          // Stale webp (from the larger original) gets regenerated below.
          try { await fs.unlink(webpPath); } catch {}
        }
      }

      try {
        await fs.stat(webpPath);
      } catch {
        await sharp(jpgPath)
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(webpPath);
        webped++;
      }
    } catch (e) {
      console.warn(`  ! ${file}: ${e.message}`);
    }
  }

  console.log(`✓ ${files.length} JPGs scanned: ${recoded} re-encoded (saved ${(savedBytes / 1024 / 1024).toFixed(1)} MB), ${webped} WebP generated`);
}

main().catch(e => { console.error(e); process.exit(1); });
