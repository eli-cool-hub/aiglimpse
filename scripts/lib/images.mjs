// AI image generation for article hero images.
//
// Strategy (in order, until one succeeds):
//   1. Pollinations.ai `turbo` model , fast (3-10s) free AI generation, unique per slug.
//   2. Pollinations.ai `flux` model  , slower free AI generation, unique per slug.
//   3. Pexels stock photo search     , real, topical photo (free, requires PEXELS_API_KEY).
//      Picks deterministically from the top results using the slug as a seed so the same
//      article always gets the same photo, and similar articles get different photos.
//   4. Branded per-slug SVG hero card, generated locally. Every article gets a UNIQUE
//      editorial card seeded by its slug. Looks like a premium magazine cover so the
//      site stays beautiful even if every external image service is down.
//
// Each article's image filename is deterministic (slug-based), so:
//   • Identical builds produce identical images (idempotent)
//   • Two different articles can NEVER collide
//   • Re-running the pipeline never re-downloads existing healthy images
//
// We intentionally do NOT use a single shared placeholder anymore. Every article
// is visually distinct, which keeps the homepage looking like a real publication
// and protects against repeated images in the same news cycle.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(process.cwd());
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');

const WIDTH = 1200;
const HEIGHT = 630;
// Pollinations.ai response times are highly variable (5s when warm, 60s+ when cold or
// rate-limited). We give each attempt a generous window, but try only ONCE per model,
// because the SVG fallback below is itself a premium, slug-unique editorial card, so
// retrying for hours is wasted budget when we already have a great backup.
const ATTEMPT_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS_PER_MODEL = 1;
const MODELS = ['turbo', 'flux'];

// Visual style per category, used in the AI prompt.
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

// Stock-photo search keywords per category. These get combined with topical nouns
// extracted from the article title so two articles in the same category don't end
// up with similar-looking photos.
const CATEGORY_PEXELS_QUERY = {
  llms:     'artificial intelligence',
  research: 'science laboratory',
  tools:    'software developer',
  business: 'business technology',
  ethics:   'law policy',
  industry: 'factory industrial',
  robotics: 'robot technology'
};

// Stopwords stripped from article titles before they become Pexels search terms.
// Two sets: generic English filler + AI-domain words that match boring stock photos.
const TITLE_STOPWORDS = new Set([
  'the','a','an','of','to','in','for','with','on','at','by','as','is','are','it','this','that','these','those','and','or','but','from','into','about','new','first','second','third','says','said','will','can','could','should','would','may','might','must','make','makes','made','let','lets','letting','use','uses','used','using','take','takes','taken','best','better','bigger','huge','massive','launches','launched','launching','releases','released','releasing','unveils','announces','announced','introduces','introduced','reports','report','reveals','revealed','tackles','fixes','speeds','accelerates','generates','propose','proposes','proposed','through','across','beyond','between','more','most','less','their','your','our','its','than','also','very','much','lets','helps','helping','help','build','builds','building','built','works','worked'
]);
const AI_STOPWORDS = new Set([
  'ai','llm','llms','model','models','system','systems','approach','approaches','method','methods','technique','techniques','framework','frameworks','tool','tools','agent','agents','machine','learning','deep','neural','algorithm','algorithms','data','dataset','datasets','training','trained','train','inference','generative','generation','large','small','foundation','transformer','architecture','platform','platforms','research','researchers','study','paper','papers','benchmark','benchmarks'
]);

// Module-level set of Pexels photo IDs used during the current pipeline run.
// Cleared by resetImageSession() at the start of a run, used by tryPexels to skip
// any photo already shown for a different article in the same run.
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
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    if (out.length >= maxWords) break;
  }
  return out;
}

const BRAND_ORANGE = '#ff4d2e';
const PAPER = '#fafaf7';

// ---------- helpers ----------

function buildPrompt(title, category) {
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE.tools;
  const themed = String(title || '')
    .replace(/["'""''']/g, '')
    .replace(/[,-]/g, '-')
    .replace(/\d+(\.\d+)?%?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${themed}. ${style}. ${BASE_STYLE}`;
}

export function seedFromSlug(slug) {
  const hash = crypto.createHash('sha256').update(String(slug)).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 1_000_000_000;
}

// Deterministic PRNG so each slug produces the same variation forever.
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

// Wrap a title across multiple SVG <tspan> lines (since SVG doesn't auto-wrap).
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

// ---------- Pexels stock photo ----------
//
// Searches Pexels by category-themed query, picks a result deterministically from the
// slug seed (so two articles in the same category usually land on different photos),
// downloads the 1200×627 landscape variant, and returns the bytes.
//
// Skipped automatically if PEXELS_API_KEY is not set.

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

async function tryPexels(slug, title, category) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    const err = new Error('PEXELS_API_KEY not set');
    err.skipped = true;
    throw err;
  }

  // Build a topical query: 2-3 meaningful nouns from the title + the category seed.
  // If extraction yields nothing usable (very short or all-stopword title), fall
  // back to just the category seed.
  const keywords = extractTitleKeywords(title, 3);
  const categorySeed = CATEGORY_PEXELS_QUERY[category] || 'technology';
  const primaryQuery = [keywords.join(' '), categorySeed].filter(Boolean).join(' ').trim() || categorySeed;
  const fallbackQuery = categorySeed;

  // Try the topical query first, then the broader category-only query if the topical
  // one returned no results. Many AI-specific terms (model names, paper acronyms) have
  // zero Pexels matches, so the fallback keeps every article landing on a real photo.
  let photos = await pexelsSearch(apiKey, primaryQuery);
  let usedQuery = primaryQuery;
  if (!photos.length && primaryQuery !== fallbackQuery) {
    photos = await pexelsSearch(apiKey, fallbackQuery);
    usedQuery = fallbackQuery;
  }
  if (!photos.length) throw new Error('no results');

  // Pick a photo deterministically by slug seed, but skip any photo already used
  // in this pipeline run so the homepage never shows the same image twice.
  const seed = seedFromSlug(slug);
  let chosen = null;
  for (let offset = 0; offset < photos.length; offset++) {
    const candidate = photos[(seed + offset) % photos.length];
    if (candidate && !_usedPhotoIds.has(candidate.id)) {
      chosen = candidate;
      break;
    }
  }
  // If every result has been used (rare: would need 30+ articles in one run on the
  // same query), just take the seeded pick anyway, dupes are better than failures.
  if (!chosen) chosen = photos[seed % photos.length];

  const photoUrl = chosen?.src?.landscape || chosen?.src?.large2x || chosen?.src?.large;
  if (!photoUrl) throw new Error('no landscape variant');

  const imgRes = await fetch(photoUrl, {
    signal: AbortSignal.timeout(PEXELS_TIMEOUT_MS)
  });
  if (!imgRes.ok) throw new Error(`download HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length < 5000) throw new Error('image too small');

  _usedPhotoIds.add(chosen.id);
  return { buf, photographer: chosen.photographer, photoPage: chosen.url, query: usedQuery };
}

// ---------- Pollinations call ----------

async function tryPollinations(model, prompt, seed) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${WIDTH}&height=${HEIGHT}&seed=${seed}&nologo=true&model=${model}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AIGlimpseBot/1.0; +https://aiglimpse.ai)',
      'Referer': 'https://aiglimpse.ai/'
    },
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error('image too small (likely error response)');
  return buf;
}

// ---------- SVG fallback (always succeeds, always unique) ----------

function buildSvgCard(slug, title, category) {
  const seed = seedFromSlug(slug);
  const palette = CATEGORY_PALETTE[category] || CATEGORY_PALETTE.tools;
  const label = (CATEGORY_LABEL[category] || 'AI Glimpse').toUpperCase();

  // Deterministic blob positions, sizes, and gradient angle.
  const cx1 = Math.floor(150 + rand(seed, 1) * 500);
  const cy1 = Math.floor(80 + rand(seed, 2) * 300);
  const r1  = Math.floor(220 + rand(seed, 3) * 200);
  const cx2 = Math.floor(600 + rand(seed, 4) * 500);
  const cy2 = Math.floor(250 + rand(seed, 5) * 280);
  const r2  = Math.floor(180 + rand(seed, 6) * 220);
  const angle = Math.floor(rand(seed, 7) * 360);

  const lines = wrapTitle(title, 28, 3);
  const titleY = HEIGHT - 140 - (lines.length - 1) * 64;
  const tspans = lines.map((line, i) =>
    `<tspan x="64" dy="${i === 0 ? 0 : 64}">${escapeXml(line)}</tspan>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(title || 'AI Glimpse')}">
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
      <stop offset="0%" stop-color="${BRAND_ORANGE}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${BRAND_ORANGE}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="${PAPER}" stroke-opacity="0.04" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  <circle cx="${cx1}" cy="${cy1}" r="${r1}" fill="url(#blob1)"/>
  <circle cx="${cx2}" cy="${cy2}" r="${r2}" fill="url(#blob2)"/>
  <g font-family="'Inter', -apple-system, system-ui, sans-serif">
    <text x="64" y="80" font-size="14" font-weight="700" letter-spacing="4" fill="${palette.accent}">${label}</text>
  </g>
  <g font-family="'Fraunces', Georgia, 'Times New Roman', serif" font-weight="700" letter-spacing="-1.5">
    <text x="64" y="${titleY}" font-size="56" fill="${PAPER}">${tspans}</text>
  </g>
  <g transform="translate(${WIDTH - 230}, ${HEIGHT - 60})" font-family="'Fraunces', Georgia, serif">
    <circle cx="20" cy="-26" r="6" fill="${BRAND_ORANGE}"/>
    <text x="0" y="0" font-size="32" font-weight="700" fill="${PAPER}" letter-spacing="-0.8">A&#x131; Glimpse</text>
  </g>
</svg>`;
}

// ---------- main API ----------

/**
 * Generate (or reuse) an article hero image.
 *
 * @param {string} slug      , article slug, also used as filename and seed source
 * @param {string} title     , article headline, used to derive the prompt
 * @param {string} category  , category slug (llms/research/tools/business/ethics/industry/robotics)
 * @returns {Promise<string>}, site-absolute URL of the image, e.g. /images/articles/foo.jpg or .svg
 */
export async function generateArticleImage(slug, title, category) {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const jpgPath = path.join(IMAGES_DIR, `${slug}.jpg`);
  const svgPath = path.join(IMAGES_DIR, `${slug}.svg`);

  // Idempotency: prefer a previously-generated healthy JPG.
  try {
    const stat = await fs.stat(jpgPath);
    if (stat.size > 5000) return `/images/articles/${slug}.jpg`;
  } catch {}

  // Idempotency: prefer a previously-generated SVG fallback.
  try {
    await fs.stat(svgPath);
    return `/images/articles/${slug}.svg`;
  } catch {}

  const prompt = buildPrompt(title, category);
  const seed = seedFromSlug(slug);

  // Tier 1+2: try AI generation via Pollinations (each model, single attempt).
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const buf = await tryPollinations(model, prompt, seed);
        await fs.writeFile(jpgPath, buf);
        console.log(`    🎨 image via Pollinations ${model} (${(buf.length / 1024).toFixed(0)} KB)`);
        return `/images/articles/${slug}.jpg`;
      } catch (e) {
        console.warn(`    ↻ Pollinations ${model} failed: ${e.message}`);
        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
  }

  // Tier 3: Pexels stock photo (real, topical, free, ~200/hr quota).
  try {
    const { buf, photographer, query } = await tryPexels(slug, title, category);
    await fs.writeFile(jpgPath, buf);
    const credit = photographer ? `, photo by ${photographer}` : '';
    console.log(`    📷 Pexels [${query}] ${(buf.length / 1024).toFixed(0)} KB${credit}`);
    return `/images/articles/${slug}.jpg`;
  } catch (e) {
    if (e.skipped) {
      console.warn('    ↻ Pexels skipped: PEXELS_API_KEY not set');
    } else {
      console.warn(`    ↻ Pexels failed: ${e.message}`);
    }
  }

  // Tier 4: per-slug branded SVG card. Always succeeds, always unique.
  const svg = buildSvgCard(slug, title, category);
  await fs.writeFile(svgPath, svg);
  console.log('    🎨 branded SVG card generated (all external services unavailable)');
  return `/images/articles/${slug}.svg`;
}
