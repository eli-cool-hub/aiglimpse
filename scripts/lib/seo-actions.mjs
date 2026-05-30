// Auto-apply high-value SEO recommendations (internal links, title/meta tweaks).
// Tracks completed actions in data/seo-actions.json so the dashboard can show "done".

import fs from 'node:fs/promises';
import path from 'node:path';

const ARTICLES_DIR = path.join(process.cwd(), 'articles');
const ACTIONS_PATH = path.join(process.cwd(), 'data', 'seo-actions.json');
const SITE = 'https://aiglimpse.ai/';

export function recId(rec) {
  return `${rec.type}|${rec.page || ''}|${rec.query || ''}`;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageToSlug(pageUrl) {
  if (!pageUrl) return null;
  const m = pageUrl.match(/\/articles\/([^/?#]+)/);
  return m ? m[1].replace(/\.html$/, '') : null;
}

function articleHref(slug) {
  return `/articles/${slug}`;
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(ACTIONS_PATH, 'utf8'));
  } catch {
    return { actions: {} };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(ACTIONS_PATH), { recursive: true });
  await fs.writeFile(ACTIONS_PATH, JSON.stringify(state, null, 2));
}

function replaceMeta(html, field, value) {
  const patterns = {
    title: [/<title>[^<]*<\/title>/, `<title>${value}</title>`],
    description: [
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${value.replace(/"/g, '&quot;')}">`
    ],
    ogTitle: [
      /<meta property="og:title" content="[^"]*">/,
      `<meta property="og:title" content="${value.replace(/"/g, '&quot;')}">`
    ],
    ogDescription: [
      /<meta property="og:description" content="[^"]*">/,
      `<meta property="og:description" content="${value.replace(/"/g, '&quot;')}">`
    ],
    twitterTitle: [
      /<meta name="twitter:title" content="[^"]*">/,
      `<meta name="twitter:title" content="${value.replace(/"/g, '&quot;')}">`
    ],
    twitterDescription: [
      /<meta name="twitter:description" content="[^"]*">/,
      `<meta name="twitter:description" content="${value.replace(/"/g, '&quot;')}">`
    ]
  };
  const [re, repl] = patterns[field];
  return html.replace(re, repl);
}

function replaceJsonLdHeadline(html, title, description) {
  return html.replace(
    /(<script type="application\/ld\+json">)(\{[\s\S]*?\})(<\/script>)/g,
    (full, open, json, close) => {
      try {
        const obj = JSON.parse(json);
        if (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article') {
          obj.headline = title.replace(/ \| AI Glimpse$/, '');
          if (description) obj.description = description;
          return `${open}${JSON.stringify(obj)}${close}`;
        }
      } catch { /* keep original */ }
      return full;
    }
  );
}

function relatedQueriesForPage(snapshot, pageUrl) {
  const page = (snapshot.gsc?.pages || []).find(p => p.key === pageUrl || p.key.replace(/\.html$/, '') === pageUrl.replace(/\.html$/, ''));
  const slug = pageToSlug(pageUrl);
  const slugTokens = slug ? slug.split('-').filter(t => t.length > 3) : [];
  const matched = (snapshot.gsc?.queries || [])
    .filter(q => {
      const words = q.key.toLowerCase().split(/\s+/);
      return words.some(w => slugTokens.some(t => w.includes(t) || t.includes(w)));
    })
    .sort((a, b) => b.impressions - a.impressions);

  if (matched.length > 0) return matched.slice(0, 5);
  // Single landing page sites: top queries usually belong to the highest-impression page.
  if (page && page.impressions >= 10) {
    return [...(snapshot.gsc?.queries || [])].sort((a, b) => b.impressions - a.impressions).slice(0, 5);
  }
  return [];
}

function buildImprovedMeta(pageUrl, snapshot, currentTitle, currentDescription) {
  const queries = relatedQueriesForPage(snapshot, pageUrl);
  const titleBase = currentTitle.replace(/ \| AI Glimpse$/, '');
  const titleLower = titleBase.toLowerCase();
  const descLower = currentDescription.toLowerCase();

  const queryText = queries.map(q => q.key).join(' ').toLowerCase();
  const wantsStarlette = queryText.includes('starlette') || titleLower.includes('starlette');
  const wantsFastapi = queryText.includes('fastapi') || titleLower.includes('fastapi');
  const wantsPython = queryText.includes('python') || titleLower.includes('python');

  let newTitle = titleBase;
  const missing = [];
  if (wantsStarlette && !titleLower.includes('starlette')) missing.push('Starlette');
  if (wantsFastapi && !titleLower.includes('fastapi')) missing.push('FastAPI');
  if (wantsPython && !titleLower.includes('python')) missing.push('Python');

  if (missing.length > 0) {
    const core = titleLower.includes('expose') || titleLower.includes('flaw') || titleLower.includes('vulnerability')
      ? 'Flaw Exposes Millions of AI Agents'
      : titleBase;
    newTitle = `${missing.join(' / ')} ${core.includes('Flaw') ? core : `Security ${core}`}`.replace(/\s+/g, ' ').trim();
  }

  if (newTitle.length > 72) newTitle = newTitle.slice(0, 69) + '…';
  newTitle = `${newTitle} | AI Glimpse`;

  let newDescription = currentDescription;
  const topQuery = queries[0]?.key;
  if (topQuery && !descLower.includes(topQuery.slice(0, 12))) {
    newDescription = `${topQuery} — ${currentDescription}`.slice(0, 158);
  }

  if (newTitle === currentTitle && newDescription === currentDescription) return null;
  return { title: newTitle, description: newDescription };
}

async function improvePageMeta(pageUrl, snapshot) {
  const slug = pageToSlug(pageUrl);
  if (!slug) return { changed: false, note: 'Could not resolve article slug.' };

  const filePath = path.join(ARTICLES_DIR, `${slug}.html`);
  let html;
  try {
    html = await fs.readFile(filePath, 'utf8');
  } catch {
    return { changed: false, note: 'Article file not found.' };
  }

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const descMatch = html.match(/<meta name="description" content="([^"]*)">/);
  const currentTitle = titleMatch?.[1] || '';
  const currentDescription = descMatch?.[1] || '';
  const improved = buildImprovedMeta(pageUrl, snapshot, currentTitle, currentDescription);
  if (!improved) return { changed: false, note: 'Title/meta already optimized for top queries.' };

  let next = html;
  next = replaceMeta(next, 'title', improved.title);
  next = replaceMeta(next, 'description', improved.description);
  next = replaceMeta(next, 'ogTitle', improved.title.replace(/ \| AI Glimpse$/, ''));
  next = replaceMeta(next, 'ogDescription', improved.description);
  next = replaceMeta(next, 'twitterTitle', improved.title.replace(/ \| AI Glimpse$/, ''));
  next = replaceMeta(next, 'twitterDescription', improved.description);
  next = replaceJsonLdHeadline(next, improved.title, improved.description);

  if (next === html) return { changed: false, note: 'No meta tags updated.' };
  await fs.writeFile(filePath, next);
  return {
    changed: true,
    note: `Updated title + meta description for click-through (${improved.title.replace(/ \| AI Glimpse$/, '')}).`
  };
}

function linkPhraseInBody(html, phrase, href) {
  if (html.includes(href)) return { html, linked: false };

  const marker = '<div class="article-body">';
  const start = html.indexOf(marker);
  if (start === -1) return { html, linked: false };
  const bodyStart = start + marker.length;
  const bodyEnd = html.indexOf('</div>', bodyStart);
  if (bodyEnd === -1) return { html, linked: false };

  let body = html.slice(bodyStart, bodyEnd);
  const protectedSegments = [];
  const stash = (snippet) => {
    protectedSegments.push(snippet);
    return `__PROTECT_${protectedSegments.length - 1}__`;
  };
  body = body.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, m => stash(m));
  body = body.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, m => stash(m));

  const re = new RegExp(`\\b(${escapeRegex(phrase)})\\b`, 'i');
  let linked = false;
  body = body.replace(re, (m) => {
    if (linked) return m;
    linked = true;
    return stash(`<a href="${href}">${m}</a>`);
  });
  body = body.replace(/__PROTECT_(\d+)__/g, (_, i) => protectedSegments[parseInt(i, 10)]);

  if (!linked) return { html, linked: false };
  return { html: html.slice(0, bodyStart) + body + html.slice(bodyEnd), linked: true };
}

async function scoreDonorArticles(targetSlug, targetHref) {
  const files = (await fs.readdir(ARTICLES_DIR)).filter(f => f.endsWith('.html') && !f.startsWith(targetSlug));
  const scored = [];

  for (const file of files) {
    const html = await fs.readFile(path.join(ARTICLES_DIR, file), 'utf8');
    if (html.includes(targetHref)) continue;
    const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
    let score = 0;
    if (/\bai agents?\b/.test(text)) score += 10;
    if (/\bpython\b/.test(text)) score += 4;
    if (/\bsecurity\b/.test(text)) score += 4;
    if (/\bframework\b/.test(text)) score += 3;
    if (/\bfastapi\b/.test(text)) score += 6;
    if (/\bstarlette\b/.test(text)) score += 6;
    if (/\bmcp\b/.test(text)) score += 5;
    if (score > 0) scored.push({ file, score, html });
  }

  return scored.sort((a, b) => b.score - a.score);
}

async function addInboundInternalLinks(pageUrl, maxLinks = 3) {
  const slug = pageToSlug(pageUrl);
  if (!slug) return { changed: false, note: 'Could not resolve article slug.' };

  const href = articleHref(slug);
  const donors = await scoreDonorArticles(slug, href);
  const anchorPhrases = ['AI agents', 'AI agent', 'agent deployments', 'production deployments', 'AI agent platforms'];
  const linkedFrom = [];

  for (const donor of donors) {
    if (linkedFrom.length >= maxLinks) break;
    let html = donor.html;
    for (const phrase of anchorPhrases) {
      const result = linkPhraseInBody(html, phrase, href);
      if (result.linked) {
        await fs.writeFile(path.join(ARTICLES_DIR, donor.file), result.html);
        linkedFrom.push(donor.file.replace(/\.html$/, ''));
        break;
      }
    }
  }

  if (linkedFrom.length === 0) {
    return { changed: false, note: 'No suitable donor articles found for internal links.' };
  }
  return {
    changed: true,
    note: `Added inbound links from ${linkedFrom.length} related article(s): ${linkedFrom.slice(0, 3).join(', ')}.`
  };
}

const AUTO_APPLY_TYPES = new Set(['near_page_one', 'low_ctr_page']);

async function applyOne(rec, snapshot, state) {
  const id = recId(rec);
  const existing = state.actions[id];
  if (existing?.status === 'done') {
    return { status: 'done', applied_at: existing.applied_at, applied_note: existing.applied_note, changed: false };
  }

  if (!AUTO_APPLY_TYPES.has(rec.type)) {
    return { status: 'open', changed: false };
  }

  const results = [];
  let changed = false;

  if (rec.type === 'low_ctr_page' && rec.page) {
    const meta = await improvePageMeta(rec.page, snapshot);
    if (meta.changed) { changed = true; results.push(meta.note); }
  }

  if (rec.type === 'near_page_one' && rec.page) {
    const links = await addInboundInternalLinks(rec.page, 3);
    if (links.changed) { changed = true; results.push(links.note); }
  }

  // low_ctr_page pages also benefit from internal links when near page 1
  if (rec.type === 'low_ctr_page' && rec.page && !results.some(r => r.includes('inbound links'))) {
    const links = await addInboundInternalLinks(rec.page, 2);
    if (links.changed) { changed = true; results.push(links.note); }
  }

  if (changed) {
    const entry = {
      status: 'done',
      applied_at: new Date().toISOString(),
      applied_note: results.join(' ')
    };
    state.actions[id] = entry;
    return { ...entry, changed: true };
  }

  return { status: 'open', changed: false };
}

export async function applySeoRecommendations(recommendations, snapshot) {
  const state = await loadState();
  let filesChanged = false;
  const enriched = [];

  for (const rec of recommendations) {
    const id = recId(rec);
    const outcome = await applyOne(rec, snapshot, state);
    if (outcome.changed) filesChanged = true;
    enriched.push({
      ...rec,
      id,
      status: outcome.status,
      applied_at: outcome.applied_at || state.actions[id]?.applied_at || null,
      applied_note: outcome.applied_note || state.actions[id]?.applied_note || null
    });
  }

  if (filesChanged) await saveState(state);
  return { recommendations: enriched, filesChanged };
}
