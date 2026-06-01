// Article imagery for AI Glimpse.
//
// Strategy (in order, until one succeeds):
//   1. Pexels stock photo search. Real, topical, free.
//      Queries are built from article-specific signals (Claude keywords,
//      proper nouns, subtitle, H2 headings) instead of generic category
//      buckets like "science laboratory" that made every research article
//      look the same.
//   2. Branded per-slug SVG hero card if Pexels is unavailable.
//
// Each article's image filename is deterministic (slug-based), so builds
// are idempotent and filenames never collide across articles.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(process.cwd());
const IMAGES_DIR = path.join(ROOT, 'images', 'articles');

const HERO_W = 1200;
const HERO_H = 630;

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

// Last-resort fallbacks only. Specific article queries are tried first.
const CATEGORY_PEXELS_FALLBACK = {
  llms:     'person using laptop technology',
  research: 'technology team office',
  tools:    'software developer workspace',
  business: 'business meeting technology',
  ethics:   'digital privacy security',
  industry: 'modern industrial technology',
  robotics: 'robot automation factory'
};

const TITLE_STOPWORDS = new Set([
  'the','a','an','of','to','in','for','with','on','at','by','as','is','are','it','this','that','these','those','and','or','but','from','into','about','new','first','second','third','says','said','will','can','could','should','would','may','might','must','make','makes','made','let','lets','letting','use','uses','used','using','take','takes','taken','best','better','bigger','huge','massive','launches','launched','launching','releases','released','releasing','unveils','announces','announced','introduces','introduced','reports','report','reveals','revealed','tackles','fixes','speeds','accelerates','generates','propose','proposes','proposed','through','across','beyond','between','more','most','less','their','your','our','its','than','also','very','much','helps','helping','help','build','builds','building','built','works','worked','what','why','how','when','where','who','which','while','after','before','during','under','over','being','been','have','has','had','not','all','any','each','every','both','few','many','some','such','only','own','same','than','too','very','just','now','here','there','then','once','still','even','back','well','way','part','full','top','key','major','latest','update','updates','updated','shows','show','shown','finds','found','face','faces','facing','aims','aim','aimed','plans','plan','planned','need','needs','needed','set','sets','setting','gets','got','getting','become','becomes','becoming','turns','turn','turned','push','pushes','pushed','drive','drives','driven','lead','leads','leading','led','move','moves','moving','moved','keep','keeps','keeping','kept','start','starts','starting','started','stop','stops','stopping','stopped','run','runs','running','ran','open','opens','opening','opened','close','closes','closing','closed','call','calls','calling','called','add','adds','adding','added','bring','brings','bringing','brought','offer','offers','offering','offered','create','creates','creating','created','change','changes','changing','changed','grow','grows','growing','grew','rise','rises','rising','rose','fall','falls','falling','fell','drop','drops','dropping','dropped','gain','gains','gaining','gained','lose','loses','losing','lost','win','wins','winning','won','beat','beats','beating','hit','hits','hitting','miss','misses','missing','missed','meet','meets','meeting','met','join','joins','joining','joined','leave','leaves','leaving','left','send','sends','sending','sent','give','gives','giving','gave','put','puts','putting','pay','pays','paying','paid','buy','buys','buying','bought','sell','sells','selling','sold','hold','holds','holding','held','look','looks','looking','looked','see','sees','seeing','saw','know','knows','knowing','knew','think','thinks','thinking','thought','want','wants','wanting','wanted','try','tries','trying','tried','come','comes','coming','came','go','goes','going','went','do','does','doing','did','say','say','tell','tells','telling','told'
]);

const AI_STOPWORDS = new Set([
  'ai','llm','llms','model','models','system','systems','approach','approaches','method','methods','technique','techniques','framework','frameworks','tool','tools','agent','agents','machine','learning','deep','neural','algorithm','algorithms','data','dataset','datasets','training','trained','train','inference','generative','generation','large','small','foundation','transformer','architecture','platform','platforms','research','researchers','study','paper','papers','benchmark','benchmarks','artificial','intelligence','technology','technologies','digital','software','hardware','computing','computer','computers','innovation','innovations','solution','solutions','industry','industries','sector','sectors','market','markets','company','companies','startup','startups','firm','firms','world','global','future','next','today','year','years','week','weeks','month','months','day','days','time','times','news','story','stories','article','articles','report','reports','analysis','analyses','overview','guide','explainer','breakdown','roundup','update','updates'
]);

const GENERIC_H2 = new Set([
  'what this means','key takeaways','key takeaway','background','looking ahead',
  'why it matters','the bottom line','what happens next','what to watch',
  'how it works','in summary','conclusion','final thoughts','overview',
  'introduction','getting started','next steps','frequently asked questions','faq'
]);

const METAPHORICAL_H2 = /\b(breaking ground|groundbreaking|difficult disease|looking ahead|what happens next|broader implications|significance|why it matters|key takeaways|next steps|in summary|final thoughts|the bottom line|what this means|what to watch|how it works)\b/i;

const WEAK_IMAGE_TERMS = new Set([
  'ground', 'breaking', 'difficult', 'disease', 'ahead', 'matters', 'significance',
  'implications', 'takeaway', 'takeaways', 'summary', 'background', 'overview',
  'introduction', 'conclusion', 'watch', 'works', 'means', 'bottom', 'line', 'steps'
]);

// Concrete visual hints when title/body mentions these topics.
const VISUAL_HINTS = [
  { re: /\b(siri|iphone|ipad|macos|ios|apple watch)\b/i, q: 'apple iphone smartphone screen' },
  { re: /\b(waymo|robotaxi|autonomous (car|taxi|vehicle|driving))\b/i, q: 'self driving taxi city street' },
  { re: /\b(openai|chatgpt|gpt-?\d|codex)\b/i, q: 'chatbot laptop screen office' },
  { re: /\b(google|gemini|deepmind|alphabet)\b/i, q: 'google office campus technology' },
  { re: /\b(microsoft|copilot|azure)\b/i, q: 'microsoft office laptop workspace' },
  { re: /\b(meta|facebook|instagram|whatsapp)\b/i, q: 'social media smartphone app' },
  { re: /\b(nvidia|gpu|graphics card)\b/i, q: 'computer server room lights' },
  { re: /\b(amazon|aws|alexa)\b/i, q: 'warehouse logistics technology' },
  { re: /\b(tesla|optimus|cybertruck)\b/i, q: 'electric car factory robot' },
  { re: /\b(humanoid|boston dynamics|figure ai|robot arm)\b/i, q: 'humanoid robot warehouse' },
  { re: /\b(drone|uav|quadcopter)\b/i, q: 'delivery drone flying sky' },
  { re: /\b(3d print|additive manufactur)\b/i, q: '3d printer manufacturing prototype' },
  { re: /\b(cybersecurity|hack|breach|malware|ransomware)\b/i, q: 'cybersecurity hacker screen code' },
  { re: /\b(privacy|gdpr|regulation|compliance)\b/i, q: 'privacy law documents desk' },
  { re: /\b(chip|semiconductor|tsmc|intel|amd)\b/i, q: 'semiconductor chip manufacturing' },
  { re: /\b(hospital|medical|healthcare|diagnos)\b/i, q: 'doctor using medical technology' },
  { re: /\b(cancer|oncolog|tumor|chemotherapy|radiation therapy)\b/i, q: 'oncology research medical laboratory' },
  { re: /\b(clinical trial|phase [123]|drug trial)\b/i, q: 'clinical trial medical research hospital' },
  { re: /\b(pill|medication|pharmaceutical|drug (?:trial|therapy))\b/i, q: 'medicine pills pharmacy healthcare' },
  { re: /\b(video|film|cinema|movie)\b/i, q: 'video production editing studio' },
  { re: /\b(voice|speech|audio|podcast)\b/i, q: 'microphone podcast recording studio' },
  { re: /\b(image|photo|vision|camera)\b/i, q: 'camera photographer urban street' },
  { re: /\b(code|coding|programming|developer|github)\b/i, q: 'programmer coding laptop desk' },
  { re: /\b(startup|venture|funding|investment)\b/i, q: 'startup team pitch meeting' },
  { re: /\b(law|legal|court|lawsuit|antitrust)\b/i, q: 'courtroom gavel legal documents' },
  { re: /\b(climate|energy|solar|wind power)\b/i, q: 'solar panels renewable energy' },
  { re: /\b(space|satellite|nasa|rocket)\b/i, q: 'rocket launch space technology' },
  { re: /\b(game|gaming|esports)\b/i, q: 'video game controller neon lights' },
  { re: /\b(education|school|student|university)\b/i, q: 'students laptop classroom' },
  { re: /\b(finance|bank|trading|stock market)\b/i, q: 'stock market trading screens' },
  { re: /\b(retail|shopping|ecommerce|store)\b/i, q: 'online shopping smartphone payment' },
  { re: /\b(farm|agriculture|crop)\b/i, q: 'smart farming drone field' },
  { re: /\b(music|spotify|audio model)\b/i, q: 'music studio headphones producer' },
  { re: /\b(translation|language learning)\b/i, q: 'language learning app globe' },
  { re: /\b(whale|ocean|marine|ship)\b/i, q: 'whale ocean ship aerial' },
  { re: /\b(brain|neuroscience|cognitive)\b/i, q: 'brain scan medical research' },
  { re: /\b(protein|biology|genome|dna)\b/i, q: 'dna laboratory microscope' },
  { re: /\b(arxiv|paper|benchmark)\b/i, q: 'scientist writing notes laptop' }
];

const _usedPhotoIds = new Set();
export function resetImageSession() { _usedPhotoIds.clear(); }

function normalizeOpts(titleOrOpts, categoryMaybe) {
  if (titleOrOpts && typeof titleOrOpts === 'object') {
    return {
      title: titleOrOpts.title || '',
      subtitle: titleOrOpts.subtitle || '',
      keywords: Array.isArray(titleOrOpts.keywords) ? titleOrOpts.keywords : [],
      bodyHtml: titleOrOpts.bodyHtml || titleOrOpts.body_html || '',
      category: titleOrOpts.category || categoryMaybe || 'tools'
    };
  }
  return {
    title: String(titleOrOpts || ''),
    subtitle: '',
    keywords: [],
    bodyHtml: '',
    category: categoryMaybe || 'tools'
  };
}

function dedupeQueries(queries) {
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    if (!q || typeof q !== 'string') continue;
    const key = q.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key.length < 3 || seen.has(key) || isWeakImageQuery(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function isMetaphoricalHeading(heading) {
  return METAPHORICAL_H2.test(String(heading || ''));
}

function isWeakImageQuery(query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.length === 1 && WEAK_IMAGE_TERMS.has(words[0])) return true;
  if (words.every(w => WEAK_IMAGE_TERMS.has(w) || w.length < 4)) return true;
  return false;
}

function extractProperNouns(...texts) {
  const out = [];
  const seen = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const raw of String(text).split(/\s+/)) {
      const w = raw.replace(/^[^\w]+|[^\w'-]+$/g, '');
      if (w.length < 2) continue;
      if (!/^[A-Z][a-zA-Z0-9'-]*$/.test(w)) continue;
      if (['The', 'A', 'An', 'New', 'AI', 'It', 'This', 'That', 'How', 'Why', 'What'].includes(w)) continue;
      const lower = w.toLowerCase();
      if (!seen.has(lower)) { seen.add(lower); out.push(w); }
    }
  }
  return out;
}

function extractTitleKeywords(text, maxWords = 4) {
  const words = String(text || '')
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

function extractH2Headings(bodyHtml) {
  if (!bodyHtml) return [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const out = [];
  let m;
  while ((m = re.exec(bodyHtml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (GENERIC_H2.has(text.toLowerCase())) continue;
    out.push(text);
  }
  return out;
}

function visualHintsFromText(...texts) {
  const blob = texts.filter(Boolean).join(' ');
  const out = [];
  for (const { re, q } of VISUAL_HINTS) {
    if (re.test(blob)) out.push(q);
  }
  return out;
}

function queryFromHeading(heading) {
  if (!heading || isMetaphoricalHeading(heading)) return '';
  const nouns = extractProperNouns(heading);
  const kw = extractTitleKeywords(heading, 4);
  if (nouns.length && kw.length) return `${nouns.slice(0, 2).join(' ')} ${kw.slice(0, 2).join(' ')}`.trim();
  if (nouns.length) return nouns.slice(0, 3).join(' ');
  if (kw.length >= 2) return kw.join(' ');
  const fallback = extractTitleKeywords(heading, 3).join(' ');
  return isWeakImageQuery(fallback) ? '' : fallback;
}

function inlineHeadingForSlot(headings, slot) {
  // Inline slot 0 is inserted after the 2nd H2, slot 1 after the 4th, etc.
  return headings[1 + slot * 2] || headings[slot + 1] || headings[slot] || headings[0] || '';
}

function buildHeroQueries(opts) {
  const { title, subtitle, keywords, bodyHtml, category } = opts;
  const firstPara = (bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]?.replace(/<[^>]+>/g, ' ').trim() || '';
  const nouns = extractProperNouns(title, subtitle);
  const titleKw = extractTitleKeywords(title, 4);
  const subKw = extractTitleKeywords(subtitle, 3);

  const queries = [
    ...visualHintsFromText(title, subtitle, firstPara),
    keywords.length ? keywords.slice(0, 3).join(' ') : '',
    keywords.length ? keywords.slice(0, 2).join(' ') : '',
    nouns.length ? nouns.slice(0, 3).join(' ') : '',
    nouns.length && titleKw.length ? `${nouns.slice(0, 2).join(' ')} ${titleKw[0]}` : '',
    titleKw.length ? titleKw.join(' ') : '',
    subKw.length ? subKw.join(' ') : '',
    nouns.length ? nouns.slice(0, 2).join(' ') : '',
    CATEGORY_PEXELS_FALLBACK[category] || 'technology workspace'
  ];
  return dedupeQueries(queries);
}

function buildInlineQueries(opts, slot) {
  const { title, subtitle, keywords, bodyHtml, category } = opts;
  const headings = extractH2Headings(bodyHtml);
  const firstPara = (bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]?.replace(/<[^>]+>/g, ' ').trim() || '';
  const nouns = extractProperNouns(title, subtitle);
  const heading = inlineHeadingForSlot(headings, slot);
  const keywordBlob = keywords.join(' ');

  const queries = [
    keywords.length ? keywords.slice(0, 3).join(' ') : '',
    keywords.length ? keywords.slice(0, 2).join(' ') : '',
    keywords.length ? keywords[slot % keywords.length] : '',
    ...visualHintsFromText(title, subtitle, keywordBlob, firstPara),
    heading && !isMetaphoricalHeading(heading) ? queryFromHeading(heading) : '',
    ...visualHintsFromText(heading || ''),
    nouns.length ? `${nouns.slice(0, 2).join(' ')} ${extractTitleKeywords(title, 2).join(' ')}`.trim() : '',
    extractTitleKeywords(title, 3).join(' '),
    CATEGORY_PEXELS_FALLBACK[category] || 'technology workspace'
  ];
  return dedupeQueries(queries);
}

export function seedFromSlug(slug) {
  const hash = crypto.createHash('sha256').update(String(slug)).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 1_000_000_000;
}

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

function pickUnusedPhoto(photos, slug, slot = 0) {
  if (!photos.length) return null;
  const seed = seedFromSlug(slug) + slot * 7919;
  for (let offset = 0; offset < photos.length; offset++) {
    const candidate = photos[(seed + offset) % photos.length];
    if (candidate && !_usedPhotoIds.has(candidate.id)) return candidate;
  }
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

async function fetchPexelsForQueries(apiKey, queries) {
  let lastError;
  for (const query of queries) {
    try {
      const photos = await pexelsSearch(apiKey, query);
      if (photos.length) return { photos, usedQuery: query };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('no results for any query');
}

async function tryPexelsHero(slug, opts) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    const err = new Error('PEXELS_API_KEY not set');
    err.skipped = true;
    throw err;
  }
  const queries = buildHeroQueries(opts);
  const { photos, usedQuery } = await fetchPexelsForQueries(apiKey, queries);
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

/**
 * Generate (or reuse) the hero image for an article.
 * Accepts either (slug, title, category) or (slug, { title, subtitle, keywords, bodyHtml, category }).
 */
export async function generateArticleImage(slug, titleOrOpts, categoryMaybe) {
  const opts = normalizeOpts(titleOrOpts, categoryMaybe);
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const jpgPath = path.join(IMAGES_DIR, `${slug}.jpg`);
  const svgPath = path.join(IMAGES_DIR, `${slug}.svg`);

  try {
    const stat = await fs.stat(jpgPath);
    if (stat.size > 5000) return `/images/articles/${slug}.jpg`;
  } catch {}
  try {
    await fs.stat(svgPath);
    return `/images/articles/${slug}.svg`;
  } catch {}

  try {
    const { buf, photographer, query } = await tryPexelsHero(slug, opts);
    await fs.writeFile(jpgPath, buf);
    const credit = photographer ? `, photo by ${photographer}` : '';
    console.log(`    📷 Pexels hero [${query}] ${(buf.length / 1024).toFixed(0)} KB${credit}`);
    return `/images/articles/${slug}.jpg`;
  } catch (e) {
    if (e.skipped) console.warn('    ↻ Pexels skipped: PEXELS_API_KEY not set');
    else console.warn(`    ↻ Pexels failed: ${e.message}`);
  }

  const svg = buildSvgCard(slug, opts.title, opts.category);
  await fs.writeFile(svgPath, svg);
  console.log('    🎨 branded SVG card generated (Pexels unavailable)');
  return `/images/articles/${slug}.svg`;
}

/**
 * Fetch inline Pexels photos. Each slot uses H2 headings + keywords for
 * article-specific queries instead of generic category stock photos.
 */
export async function generateInlineImages(slug, titleOrOpts, categoryMaybe, count = 2) {
  const opts = normalizeOpts(titleOrOpts, categoryMaybe);
  if (!count) return [];
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const out = [];

  for (let slot = 0; slot < count; slot++) {
    const filename = `${slug}-inline-${slot + 1}.jpg`;
    const filePath = path.join(IMAGES_DIR, filename);
    const url = `/images/articles/${filename}`;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 5000) {
        out.push({ url, photographer: null, photoPage: null, alt: opts.title, query: null, reused: true });
        continue;
      }
    } catch {}

    const queries = buildInlineQueries(opts, slot);
    try {
      const { photos, usedQuery } = await fetchPexelsForQueries(apiKey, queries);
      const chosen = pickUnusedPhoto(photos, slug, slot + 1);
      if (!chosen) continue;
      const buf = await downloadPexelsPhoto(chosen);
      await fs.writeFile(filePath, buf);
      _usedPhotoIds.add(chosen.id);
      const heading = inlineHeadingForSlot(extractH2Headings(opts.bodyHtml), slot);
      out.push({
        url,
        photographer: chosen.photographer || null,
        photographerUrl: chosen.photographer_url || null,
        photoPage: chosen.url || null,
        alt: heading || opts.title,
        query: usedQuery,
        reused: false
      });
      console.log(`    📷 Pexels inline ${slot + 1} [${usedQuery}] ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.warn(`    ↻ inline ${slot + 1} failed (${queries.slice(0, 2).join(' | ')}): ${e.message}`);
    }
  }

  return out;
}

export function injectInlineImages(bodyHtml, images) {
  if (!bodyHtml || !Array.isArray(images) || !images.length) return bodyHtml;

  const closeH2Re = /<\/h2>/gi;
  const positions = [];
  let m;
  while ((m = closeH2Re.exec(bodyHtml)) !== null) {
    positions.push(m.index + m[0].length);
  }
  if (positions.length < 3) return bodyHtml;

  const slotIndices = [];
  for (let i = 0; i < images.length; i++) {
    const slotPos = 1 + i * 2;
    if (slotPos < positions.length) slotIndices.push(positions[slotPos]);
  }
  if (!slotIndices.length) return bodyHtml;

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
