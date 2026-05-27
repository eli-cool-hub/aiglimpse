// Article imagery for AI Glimpse.
//
// Strategy (in order, until one succeeds):
//   1. Pexels stock photo search.   Real, topical, free, ~200 req/hour quota.
//      Picks deterministically from the top results using the slug as a seed
//      so identical builds reuse the same photo and similar articles in one run
//      do NOT collide on the same photo.
//   2. Branded per-slug SVG hero card. Always succeeds, always unique. Only fires
//      if Pexels is unreachable or PEXELS_API_KEY is missing. Looks like a
//      premium magazine cover so the site stays visually whole even offline.
//
// We removed the Pollinations.ai tier in May 2026: the model timed out
// frequently on GitHub-hosted runners and its prompted style ("warm dark
// background with orange and amber highlights") made every article hero
// look the same orange-tinted shade. Real photos beat orange AI art for an
// editorial publication.
//
// Each article's image filename is deterministic (slug-based), so:
//   • Identical builds produce identical images (idempotent)
//   • Two different articles can NEVER collide on the same filename
//   • Re-running the pipeline never re-downloads existing healthy images

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(process.cwd());
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');

const HERO_W = 1200;
const HERO_H = 630;

// Color palette per category, used in the SVG fallback so each topic still feels distinct.
const CATEGORY_PALETTE = {
  llms:     { bg: '#0a0f1f', accent: '#4f8cff', glow: '#9ec3ff' },
  research: { bg: '#0f0a1f', accent: '#a06bff', glow: '#d1b4ff' },
  tools:    { bg: '#0a1a1a', accent: '#2ec5b6', glow: '#a6f3ec' },
  business: { bg: '#1a1208', accent: '#ffa84a', glow: '#ffd9a8' },
  ethics:   { bg: '#0a1612', accent: '#5ed387', glow: '#bbf0cd' },
  industry: { bg: '#1a1006', accent: '#ff6b35', glow: '#ffc4a8' },
  robotics: { bg: '#0a0a0f', accent: '#c0c8d4', glow: '#e8edf5' }
};

const CATEGORY_LABEL = {
  llms: 'LLMs', research: 'Research', tools: 'Tools',
  business: 'Business', ethics: 'Ethics', industry: 'Industry',
  robotics: 'Robotics'
};

// Primary Pexels query per category, used for the hero photo.
const CATEGORY_PEXELS_QUERY = {
  llms:     'artificial intelligence',
  research: 'science laboratory',
  tools:    'software developer',
  business: 'business technology',
  ethics:   'law policy',
  industry: 'factory industrial',
  robotics: 'robot technology'
};

// Alternative Pexels queries per category for INLINE images. Cycled so a
// 2500-word evergreen on, say, robotics gets three visually distinct photos
// (one per slot) instead of three near-identical robot factory shots.
const CATEGORY_PEXELS_INLINE = {
  llms:     ['computer code', 'data visualization', 'futuristic technology'],
  research: ['scientist working', 'data analysis', 'modern research'],
  tools:    ['workspace desk', 'modern office', 'startup workspace'],
  business: ['business meeting', 'startup team', 'corporate finance'],
  ethics:   ['government building', 'legal documents', 'judge gavel'],
  industry: ['warehouse logistics', 'manufacturing line', 'industrial worker'],
  robotics: ['robot hand', 'mechanical engineer', 'autonomous machine']
};

const TITLE_STOPWORDS = new Set([
  'the','a','an','of','to','in','for','with','on','at','by','as','is','are','it','this','that','these','those','and','or','but','from','into','about','new','first','second','third','says','said','will','can','could','should','would','may','might','must','make','makes','made','let','lets','letting','use','uses','used','using','take','takes','taken','best','better','bigger','huge','massive','launches','launched','launching','releases','released','releasing','unveils','announces','announced','introduces','introduced','reports','report','reveals','revealed','tackles','fixes','speeds','accelerates','generates','propose','proposes','proposed','through','across','beyond','between','more','most','less','their','your','our','its','than','also','very','much','helps','helping','help','build','builds','building','built','works','worked'
]);
const AI_STOPWORDS = new Set([
  'ai','llm','llms','model','models','system','systems','approach','approaches','method','methods','technique','techniques','framework','frameworks','tool','tools','agent','agents','machine','learning','deep','neural','algorithm','algorithms','data','dataset','datasets','training','trained','train','inference','generative','generation','large','small','foundation','transformer','architecture','platform','platforms','research','researchers','study','paper','papers','benchmark','benchmarks'
]);

// Module-level dedupe of Pexels photo IDs across ONE pipeline run. Reset by
// resetImageSession() at the start of a run. Pixel-identical photos never
// appear twice on the homepage in the same run thanks to this.
const _usedPhotoIds = new Set();
export function resetImageSession() { _usedPhotoIds.clear(); }

function extractTitleKeywords(title, maxWords = 3) {
  const words = String(title || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w =>
      w.length >= 4 &&
      !/^\d+$/.test(w) &&
      !TITLE_STOPWORDS.has(w) &&
      !AI_STOPWORDS.has(w)
    );
  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (!seen.has(w)) { seen.add(w); out.push(w); }
    if (out.length >= maxWords) break;
  }
  return out;
}

export function seedFromSlug(slug) {
  const hash = crypto.createHash('sha256').update(String(slug)).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 1_000_000_000;
}

// Deterministic PRNG so each slug produces the same SVG variation forever.
function rand(seed, idx) {
  const x = Math.sin(seed * 9301 + idx * 49297) * 233280;
  return x - Math.floor(x);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTitle(title, maxChars = 28, maxLines = 3) {
  const words = String(title || 'AI Glimpse').split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
      if (lines.length === maxLines - 1) break;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+\S*$/, '') + '...';
  }
  return lines;
}

// ---------- Pexels ----------

const PEXELS_TIMEOUT_MS = 12000;
const PEXELS_PER_PAGE = 30;

async function pexelsSearch(apiKey, query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&orientation=landscape&size=large&per_page=${PEXELS_PER_PAGE}`;
  const res = await fetch(url, {
    headers: {
      Authorization: apiKey,
      'User-Agent': 'AIGlimpseBot/1.0 (+https://aiglimpse.ai)'
    },
    signal: AbortSignal.timeout(PEXELS_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.photos) ? data.photos : [];
}

// Pick a photo from results deterministically, skipping any already used in this run.
function pickUnusedPhoto(photos, slug, slot = 0) {
  if (!photos.length) return null;
  const seed = seedFromSlug(slug) + slot * 7919; // 7919 is prime, decorrelates slots
  for (let offset = 0; offset < photos.length; offset++) {
    const candidate = photos[(seed + offset) % photos.length];
    if (candidate && !_usedPhotoIds.has(candidate.id)) return candidate;
  }
  // Every result in this query was used. Take the seeded pick anyway:
  // a duplicate is acceptable in the rare case of 30+ articles on the same query.
  return photos[seed % photos.length];
}

async function downloadPexelsPhoto(photo) {
  const photoUrl = photo?.src?.landscape || photo?.src?.large2x || photo?.src?.large;
  if (!photoUrl) throw new Error('no landscape variant');
  const imgRes = await fetch(photoUrl, { signal: AbortSignal.timeout(PEXELS_TIMEOUT_MS) });
  if (!imgRes.ok) throw new Error(`download HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length < 5000) throw new Error('image too small');
  return buf;
}

async function fetchPexelsForQuery(apiKey, query, fallbackQuery) {
  let photos = await pexelsSearch(apiKey, query);
  let usedQuery = query;
  if (!photos.length && query !== fallbackQuery) {
    photos = await pexelsSearch(apiKey, fallbackQuery);
    usedQuery = fallbackQuery;
  }
  return { photos, usedQuery };
}

async function tryPexelsHero(slug, title, category) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    const err = new Error('PEXELS_API_KEY not set');
    err.skipped = true;
    throw err;
  }
  const keywords = extractTitleKeywords(title, 3);
  const categorySeed = CATEGORY_PEXELS_QUERY[category] || 'technology';
  const primaryQuery = [keywords.join(' '), categorySeed].filter(Boolean).join(' ').trim() || categorySeed;
  const { photos, usedQuery } = await fetchPexelsForQuery(apiKey, primaryQuery, categorySeed);
  if (!photos.length) throw new Error('no results');

  const chosen = pickUnusedPhoto(photos, slug, 0);
  if (!chosen) throw new Error('no candidate');

  const buf = await downloadPexelsPhoto(chosen);
  _usedPhotoIds.add(chosen.id);
  return {
    buf,
    photographer: chosen.photographer,
    photographerUrl: chosen.photographer_url,
    photoPage: chosen.url,
    query: usedQuery
  };
}

// ---------- SVG fallback (always succeeds, always unique) ----------

const BRAND_ORANGE = '#ff4d2e';
const PAPER = '#fafaf7';

function buildSvgCard(slug, title, category) {
  const seed = seedFromSlug(slug);
  const palette = CATEGORY_PALETTE[category] || CATEGORY_PALETTE.tools;
  const label = (CATEGORY_LABEL[category] || 'AI Glimpse').toUpperCase();

  const cx1 = Math.floor(150 + rand(seed, 1) * 500);
  const cy1 = Math.floor(80 + rand(seed, 2) * 300);
  const r1  = Math.floor(220 + rand(seed, 3) * 200);
  const cx2 = Math.floor(600 + rand(seed, 4) * 500);
  const cy2 = Math.floor(250 + rand(seed, 5) * 280);
  const r2  = Math.floor(180 + rand(seed, 6) * 220);
  const angle = Math.floor(rand(seed, 7) * 360);

  const lines = wrapTitle(title, 28, 3);
  const titleY = HERO_H - 140 - (lines.length - 1) * 64;
  const tspans = lines.map((line, i) =>
    `<tspan x="64" dy="${i === 0 ? 0 : 64}">${escapeXml(line)}</tspan>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HERO_W} ${HERO_H}" role="img" aria-label="${escapeXml(title || 'AI Glimpse')}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle})" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
    <radialGradient id="blob1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${palette.glow}" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="${palette.accent}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blob2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="${PAPER}" stroke-opacity="0.04" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${HERO_W}" height="${HERO_H}" fill="url(#bg)"/>
  <rect width="${HERO_W}" height="${HERO_H}" fill="url(#grid)"/>
  <circle cx="${cx1}" cy="${cy1}" r="${r1}" fill="url(#blob1)"/>
  <circle cx="${cx2}" cy="${cy2}" r="${r2}" fill="url(#blob2)"/>
  <g font-family="'Inter', -apple-system, system-ui, sans-serif">
    <text x="64" y="80" font-size="14" font-weight="700" letter-spacing="4" fill="${palette.accent}">${label}</text>
  </g>
  <g font-family="'Fraunces', Georgia, 'Times New Roman', serif" font-weight="700" letter-spacing="-1.5">
    <text x="64" y="${titleY}" font-size="56" fill="${PAPER}">${tspans}</text>
  </g>
  <g transform="translate(${HERO_W - 230}, ${HERO_H - 60})" font-family="'Fraunces', Georgia, serif">
    <circle cx="20" cy="-26" r="6" fill="${BRAND_ORANGE}"/>
    <text x="0" y="0" font-size="32" font-weight="700" fill="${PAPER}" letter-spacing="-0.8">A&#x131; Glimpse</text>
  </g>
</svg>`;
}

// ---------- main hero API ----------

/**
 * Generate (or reuse) the hero image for an article.
 *
 * @param {string} slug      slug used as filename and dedupe seed
 * @param {string} title     headline used to derive the Pexels query
 * @param {string} category  one of llms/research/tools/business/ethics/industry/robotics
 * @returns {Promise<string>} site-absolute URL, e.g. /images/articles/foo.jpg
 */
export async function generateArticleImage(slug, title, category) {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const jpgPath = path.join(IMAGES_DIR, `${slug}.jpg`);
  const svgPath = path.join(IMAGES_DIR, `${slug}.svg`);

  // Idempotent: if a healthy hero already exists on disk, reuse it.
  try {
    const stat = await fs.stat(jpgPath);
    if (stat.size > 5000) return `/images/articles/${slug}.jpg`;
  } catch {}
  try {
    await fs.stat(svgPath);
    return `/images/articles/${slug}.svg`;
  } catch {}

  // Tier 1: Pexels real photo, topical query.
  try {
    const { buf, photographer, query } = await tryPexelsHero(slug, title, category);
    await fs.writeFile(jpgPath, buf);
    const credit = photographer ? `, photo by ${photographer}` : '';
    console.log(`    📷 Pexels hero [${query}] ${(buf.length / 1024).toFixed(0)} KB${credit}`);
    return `/images/articles/${slug}.jpg`;
  } catch (e) {
    if (e.skipped) console.warn('    ↻ Pexels skipped: PEXELS_API_KEY not set');
    else console.warn(`    ↻ Pexels failed: ${e.message}`);
  }

  // Tier 2: per-slug branded SVG card. Always unique, always succeeds.
  const svg = buildSvgCard(slug, title, category);
  await fs.writeFile(svgPath, svg);
  console.log('    🎨 branded SVG card generated (Pexels unavailable)');
  return `/images/articles/${slug}.svg`;
}

// ---------- inline images ----------
//
// Long-form articles get visual relief: 1 to 2 inline photos placed at H2
// boundaries inside the body. Each inline slot uses a different Pexels query
// from CATEGORY_PEXELS_INLINE so the article does not show three near-
// identical photos. Returns a list of {url, photographer, photoPage, alt}
// objects, the caller decides where to inject them.

/**
 * Fetch up to `count` inline Pexels photos for an article. Returns an array
 * of { url, photographer, photoPage, alt, query }. If Pexels is unavailable
 * or yields no usable photos, returns an empty array, the caller silently
 * falls back to "no inline image".
 *
 * @param {string} slug      article slug, used as filename + dedupe seed
 * @param {string} title     article title, used for alt text
 * @param {string} category  category slug
 * @param {number} count     desired inline image count (will return up to this)
 */
export async function generateInlineImages(slug, title, category, count = 2) {
  if (!count) return [];
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const queries = CATEGORY_PEXELS_INLINE[category] || CATEGORY_PEXELS_INLINE.tools;
  const fallbackQuery = CATEGORY_PEXELS_QUERY[category] || 'technology';
  const out = [];

  for (let slot = 0; slot < count; slot++) {
    const query = queries[slot % queries.length];
    const filename = `${slug}-inline-${slot + 1}.jpg`;
    const filePath = path.join(IMAGES_DIR, filename);
    const url = `/images/articles/${filename}`;

    // Idempotent: reuse if a healthy file is already on disk.
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 5000) {
        out.push({ url, photographer: null, photoPage: null, alt: title, query, reused: true });
        continue;
      }
    } catch {}

    try {
      const { photos } = await fetchPexelsForQuery(apiKey, query, fallbackQuery);
      if (!photos.length) continue;
      const chosen = pickUnusedPhoto(photos, slug, slot + 1);
      if (!chosen) continue;
      const buf = await downloadPexelsPhoto(chosen);
      await fs.writeFile(filePath, buf);
      _usedPhotoIds.add(chosen.id);
      out.push({
        url,
        photographer: chosen.photographer || null,
        photographerUrl: chosen.photographer_url || null,
        photoPage: chosen.url || null,
        alt: title,
        query,
        reused: false
      });
      console.log(`    📷 Pexels inline ${slot + 1} [${query}] ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.warn(`    ↻ inline ${slot + 1} failed: ${e.message}`);
    }
  }

  return out;
}

/**
 * Inject inline figure elements into an article body at H2 boundaries.
 * Targets every other H2 starting from the second one, so a 5-H2 article gets
 * images after H2 #2 and #4. Skips if the body has fewer than 3 H2s (too short
 * for inline photos). Returns the (possibly modified) body HTML.
 *
 * @param {string} bodyHtml   article body HTML
 * @param {Array}  images     [{ url, photographer, photoPage, alt, query }, ...]
 */
export function injectInlineImages(bodyHtml, images) {
  if (!bodyHtml || !Array.isArray(images) || !images.length) return bodyHtml;

  // Find all H2 closing-tag positions.
  const closeH2Re = /<\/h2>/gi;
  const positions = [];
  let m;
  while ((m = closeH2Re.exec(bodyHtml)) !== null) {
    positions.push(m.index + m[0].length);
  }
  if (positions.length < 3) return bodyHtml;

  // Slot indices: place images after the 2nd, 4th, 6th H2 etc.
  const slotIndices = [];
  for (let i = 0; i < images.length; i++) {
    const slotPos = 1 + i * 2; // 1-based: H2 #2, #4, #6 ...
    if (slotPos < positions.length) slotIndices.push(positions[slotPos]);
  }

  if (!slotIndices.length) return bodyHtml;

  // Insert from last to first so earlier indices stay valid.
  let out = bodyHtml;
  for (let i = slotIndices.length - 1; i >= 0; i--) {
    const img = images[i];
    if (!img) continue;
    const figure = renderInlineFigure(img);
    out = out.slice(0, slotIndices[i]) + '\n' + figure + '\n' + out.slice(slotIndices[i]);
  }
  return out;
}

function renderInlineFigure(img) {
  const altEsc = String(img.alt || '').replace(/"/g, '&quot;');
  const credit = img.photographer
    ? `<figcaption class="article-image-credit">Photo by ${img.photoPage
        ? `<a href="${escapeAttr(img.photoPage)}" rel="nofollow noopener" target="_blank">${escapeAttr(img.photographer)}</a>`
        : escapeAttr(img.photographer)} on Pexels.</figcaption>`
    : '';
  return `<figure class="article-image article-image--inline">
  <img src="${img.url}" alt="${altEsc}" loading="lazy" width="1200" height="630">
  ${credit}
</figure>`;
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
