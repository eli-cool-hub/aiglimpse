#!/usr/bin/env node
// Refresh sitemaps, submit them to Google Search Console, ping IndexNow, and
// inspect a prioritized slice of URLs. The job must always write a report —
// a single URL Inspection timeout must not fail the workflow.
//
// Required env: GOOGLE_SERVICE_ACCOUNT_JSON
// Optional env: INDEXNOW_KEY, SITE_URL, INSPECT_LIMIT

import { JWT } from 'google-auth-library';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  regenerateSitemap,
  pingIndexNow,
  recentNewsArticles,
  SITEMAP_FILES
} from './lib/sitemap.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://aiglimpse.ai').replace(/\/$/, '') + '/';
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SA_JSON) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const INSPECT_LIMIT = Math.max(40, Number(process.env.INSPECT_LIMIT || 220));
const BATCH = 3;
const REQUEST_TIMEOUT_MS = 45000;

const creds = JSON.parse(SA_JSON);
const jwt = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: [
    'https://www.googleapis.com/auth/webmasters',
    'https://www.googleapis.com/auth/webmasters.readonly'
  ]
});
await jwt.authorize();
const token = jwt.credentials.access_token;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function googleApi(url, opts = {}, attempt = 0) {
  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: opts.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const wait = res.status === 429 ? 60000 : 2000 * (attempt + 1);
      console.warn(`  HTTP ${res.status} — retry in ${wait / 1000}s`);
      await sleep(wait);
      return googleApi(url, opts, attempt + 1);
    }
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    if (attempt < 2) {
      await sleep(1500 * (attempt + 1));
      return googleApi(url, opts, attempt + 1);
    }
    return { status: 0, ok: false, timeout: true, body: { error: String(err?.message || err) } };
  }
}

function summarizeCoverage(state = '') {
  const s = state.toLowerCase();
  if (s.includes('indexed') && !s.includes('not indexed')) return 'indexed';
  if (s.includes('discovered') || s.includes('crawled') || s.includes('submitted')) return 'waiting';
  if (s.includes('not indexed') || s.includes('excluded')) return 'not_indexed';
  return 'unknown';
}

function toPath(absUrl) {
  return absUrl.replace(SITE_URL, '/');
}

const published = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'published.json'), 'utf8'));
const urls = await regenerateSitemap(published, SITE_URL);
console.log(`Sitemaps refreshed (${urls.length} indexable URLs)`);

const evergreenSlugs = new Set((published.articles || []).filter(a => a.evergreen).map(a => a.slug));
const base = SITE_URL.replace(/\/$/, '');

function urlPriority(u) {
  if (u === `${base}/` || u === base) return 0;
  if (/\/categories\/[^/]+$/.test(u)) return 1;
  if (u.includes('/guides')) return 2;
  if (u.includes('/pages/')) return 3;
  const m = u.match(/\/articles\/([^/?#]+)/);
  if (m && evergreenSlugs.has(m[1])) return 4;
  return 10;
}

const siteEnc = encodeURIComponent(SITE_URL);
const sitemapSubmit = {};
for (const file of SITEMAP_FILES) {
  const sitemapUrl = encodeURIComponent(`${SITE_URL}${file}`);
  const submit = await googleApi(
    `https://www.googleapis.com/webmasters/v3/sites/${siteEnc}/sitemaps/${sitemapUrl}`,
    { method: 'PUT' }
  );
  sitemapSubmit[file] = submit.ok ? 'ok' : `error_${submit.status}`;
  console.log(submit.ok
    ? `✓ GSC sitemap submit: ${SITE_URL}${file}`
    : `⚠ GSC sitemap submit ${file} HTTP ${submit.status}: ${JSON.stringify(submit.body).slice(0, 200)}`);
}

const newsUrls = recentNewsArticles(published).map(a => `${base}/articles/${a.slug}`);
const priorityPing = [
  ...urls.filter(u => urlPriority(u) <= 4),
  ...newsUrls
];
const indexNow = await pingIndexNow(priorityPing, SITE_URL);
console.log(indexNow.skipped
  ? '↪ IndexNow skipped (no INDEXNOW_KEY)'
  : indexNow.ok
    ? `✓ IndexNow pinged ${indexNow.count} URLs (hubs + evergreen + last 48h)`
    : `⚠ IndexNow HTTP ${indexNow.status}: ${indexNow.body}`);

async function loadPrevious() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'reports', 'indexing', 'latest.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { urls: [] };
  }
}

const previous = await loadPrevious();
const prevByPath = new Map((previous.urls || []).map(e => [e.url, e]));

function inspectScore(absUrl) {
  const prio = urlPriority(absUrl);
  if (prio <= 4) return prio;
  const prev = prevByPath.get(toPath(absUrl));
  if (!prev) return 5;
  if (prev.bucket === 'unknown' || /timeout|http \d/i.test(prev.coverageState || '')) return 6;
  if (prev.coverageState === 'Crawled - currently not indexed') return 7;
  if (prev.bucket === 'waiting') return 8;
  if (prev.bucket === 'indexed') return 20;
  return 10;
}

const inspectQueue = [...urls]
  .sort((a, b) => inspectScore(a) - inspectScore(b) || urlPriority(a) - urlPriority(b))
  .slice(0, INSPECT_LIMIT);

async function inspectOne(url) {
  const r = await googleApi('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL })
  });

  if (r.status === 429) return { url, rateLimited: true };
  if (r.timeout || r.status === 0) {
    return {
      url,
      rateLimited: false,
      entry: {
        url: toPath(url),
        verdict: null,
        coverageState: 'Timeout',
        bucket: 'unknown',
        robotsTxtState: null,
        indexingState: null,
        lastCrawlTime: null,
        pageFetchState: null
      }
    };
  }

  const idx = r.body?.inspectionResult?.indexStatusResult || {};
  const coverageState = idx.coverageState || (r.ok ? 'Unknown' : `HTTP ${r.status}`);
  return {
    url,
    rateLimited: false,
    entry: {
      url: toPath(url),
      verdict: idx.verdict || null,
      coverageState,
      bucket: summarizeCoverage(coverageState),
      robotsTxtState: idx.robotsTxtState || null,
      indexingState: idx.indexingState || null,
      lastCrawlTime: idx.lastCrawlTime || null,
      pageFetchState: idx.pageFetchState || null
    }
  };
}

console.log(`Inspecting ${inspectQueue.length}/${urls.length} URLs (priority hubs, evergreen, unknown, then newest)...`);
const fresh = new Map();
let timeouts = 0;
let httpErrors = 0;

for (let i = 0; i < inspectQueue.length; i += BATCH) {
  const batch = inspectQueue.slice(i, i + BATCH);
  let results = await Promise.all(batch.map(inspectOne));

  if (results.some(r => r.rateLimited)) {
    console.warn('Rate limited — pausing 60s');
    await sleep(60000);
    results = await Promise.all(batch.map(inspectOne));
  }

  for (const r of results) {
    if (!r.entry) continue;
    if (r.entry.coverageState === 'Timeout') timeouts++;
    if (String(r.entry.coverageState).startsWith('HTTP ')) httpErrors++;
    // Timeouts keep yesterday's row when we have one, so coverage doesn't flap.
    if (r.entry.coverageState === 'Timeout' && prevByPath.has(r.entry.url)) {
      fresh.set(r.entry.url, prevByPath.get(r.entry.url));
    } else {
      fresh.set(r.entry.url, r.entry);
    }
  }

  if ((i + BATCH) % 30 === 0 || i + BATCH >= inspectQueue.length) {
    console.log(`  … ${Math.min(i + BATCH, inspectQueue.length)}/${inspectQueue.length}`);
  }
  await sleep(400);
}

const merged = [];
for (const abs of urls) {
  const p = toPath(abs);
  merged.push(fresh.get(p) || prevByPath.get(p) || {
    url: p,
    verdict: null,
    coverageState: 'Not inspected this run',
    bucket: 'unknown',
    robotsTxtState: null,
    indexingState: null,
    lastCrawlTime: null,
    pageFetchState: null
  });
}

const summary = { indexed: 0, waiting: 0, not_indexed: 0, unknown: 0 };
for (const e of merged) {
  if (e.bucket === 'indexed') summary.indexed++;
  else if (e.bucket === 'waiting') summary.waiting++;
  else if (e.bucket === 'not_indexed') summary.not_indexed++;
  else summary.unknown++;
}

const gscOk = Object.values(sitemapSubmit).every(v => v === 'ok');
const report = {
  generated_at: new Date().toISOString(),
  site: SITE_URL,
  sitemap: `${SITE_URL}sitemap.xml`,
  sitemaps: SITEMAP_FILES.map(f => `${SITE_URL}${f}`),
  url_count: urls.length,
  inspected_this_run: inspectQueue.length,
  inspect_timeouts: timeouts,
  inspect_http_errors: httpErrors,
  gsc_sitemap_submit: gscOk ? 'ok' : sitemapSubmit,
  indexnow: indexNow.skipped ? 'skipped' : indexNow.ok ? 'ok' : `error_${indexNow.status}`,
  summary,
  urls: merged
};

const reportDir = path.join(process.cwd(), 'reports', 'indexing');
await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(path.join(reportDir, 'latest.json'), JSON.stringify(report, null, 2));
await fs.writeFile(
  path.join(reportDir, `${report.generated_at.slice(0, 10)}.json`),
  JSON.stringify(report, null, 2)
);
await fs.writeFile(path.join(process.cwd(), 'data', 'indexing-status.json'), JSON.stringify({
  updated_at: report.generated_at,
  summary: report.summary,
  url_count: report.url_count,
  inspected_this_run: report.inspected_this_run,
  index_pct: Math.round((summary.indexed / Math.max(1, report.url_count)) * 100)
}, null, 2));

console.log('\nIndexing summary');
console.log(`  Indexed:           ${summary.indexed}`);
console.log(`  Waiting in Google: ${summary.waiting}`);
console.log(`  Not indexed:       ${summary.not_indexed}`);
console.log(`  Unknown:           ${summary.unknown}`);
console.log(`  Inspected now:     ${inspectQueue.length} (${timeouts} timeouts)`);
console.log(`Wrote reports/indexing/latest.json`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '## Indexing report',
    '',
    `- URLs in sitemap: **${urls.length}**`,
    `- Inspected this run: **${inspectQueue.length}** (${timeouts} timeouts)`,
    `- GSC sitemap submit: **${typeof report.gsc_sitemap_submit === 'string' ? report.gsc_sitemap_submit : JSON.stringify(report.gsc_sitemap_submit)}**`,
    `- IndexNow: **${report.indexnow}**`,
    `- Indexed: **${summary.indexed}** | Waiting: **${summary.waiting}** | Not indexed: **${summary.not_indexed}** | Unknown: **${summary.unknown}**`,
    ''
  ].join('\n');
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}

// Inspection timeouts are expected on GSC's API; never fail the workflow after
// sitemaps were written. The report + commit are the deliverable.
