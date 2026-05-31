#!/usr/bin/env node
// Ensure every public URL is in sitemap.xml, submitted to Google Search Console,
// pinged via IndexNow (Google/Bing/Yandex), and inspected for indexing status.
//
// Required env: GOOGLE_SERVICE_ACCOUNT_JSON
// Optional env: INDEXNOW_KEY, SITE_URL

import { JWT } from 'google-auth-library';
import fs from 'node:fs/promises';
import path from 'node:path';
import { collectIndexableUrls, regenerateSitemap, pingIndexNow } from './lib/sitemap.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://aiglimpse.ai').replace(/\/$/, '') + '/';
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SA_JSON) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

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

async function googleApi(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function summarizeCoverage(state = '') {
  const s = state.toLowerCase();
  if (s.includes('indexed') && !s.includes('not indexed')) return 'indexed';
  if (s.includes('discovered') || s.includes('crawled') || s.includes('submitted')) return 'waiting';
  if (s.includes('not indexed') || s.includes('excluded')) return 'not_indexed';
  return 'unknown';
}

const published = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'published.json'), 'utf8'));
const urls = await regenerateSitemap(published, SITE_URL);
console.log(`Sitemap refreshed with ${urls.length} URLs`);

const sitemapPath = encodeURIComponent(`${SITE_URL}sitemap.xml`);
const siteEnc = encodeURIComponent(SITE_URL);
const submit = await googleApi(
  `https://www.googleapis.com/webmasters/v3/sites/${siteEnc}/sitemaps/${sitemapPath}`,
  { method: 'PUT' }
);
console.log(submit.ok
  ? `✓ GSC sitemap submit: ${SITE_URL}sitemap.xml`
  : `⚠ GSC sitemap submit HTTP ${submit.status}: ${JSON.stringify(submit.body).slice(0, 200)}`);

const indexNow = await pingIndexNow(urls, SITE_URL);
console.log(indexNow.skipped
  ? '↪ IndexNow skipped (no INDEXNOW_KEY)'
  : indexNow.ok
    ? `✓ IndexNow pinged ${indexNow.count} URLs`
    : `⚠ IndexNow HTTP ${indexNow.status}: ${indexNow.body}`);

console.log(`Inspecting ${urls.length} URLs via Search Console (URL Inspection API)...`);
const inspected = [];
let indexed = 0;
let waiting = 0;
let notIndexed = 0;
let unknown = 0;

for (let i = 0; i < urls.length; i++) {
  const url = urls[i];
  const r = await googleApi('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL })
  });

  if (r.status === 429) {
    console.warn('Rate limited — pausing 60s');
    await sleep(60000);
    i--;
    continue;
  }

  const idx = r.body?.inspectionResult?.indexStatusResult || {};
  const coverageState = idx.coverageState || 'Unknown';
  const bucket = summarizeCoverage(coverageState);
  if (bucket === 'indexed') indexed++;
  else if (bucket === 'waiting') waiting++;
  else if (bucket === 'not_indexed') notIndexed++;
  else unknown++;

  inspected.push({
    url: url.replace(SITE_URL, '/'),
    verdict: idx.verdict || null,
    coverageState,
    bucket,
    robotsTxtState: idx.robotsTxtState || null,
    indexingState: idx.indexingState || null,
    lastCrawlTime: idx.lastCrawlTime || null,
    pageFetchState: idx.pageFetchState || null
  });

  if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${urls.length}`);
  await sleep(150);
}

const report = {
  generated_at: new Date().toISOString(),
  site: SITE_URL,
  sitemap: `${SITE_URL}sitemap.xml`,
  url_count: urls.length,
  gsc_sitemap_submit: submit.ok ? 'ok' : `error_${submit.status}`,
  indexnow: indexNow.skipped ? 'skipped' : indexNow.ok ? 'ok' : `error_${indexNow.status}`,
  summary: { indexed, waiting, not_indexed: notIndexed, unknown },
  urls: inspected
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
  url_count: report.url_count
}, null, 2));

console.log('\nIndexing summary');
console.log(`  Indexed:           ${indexed}`);
console.log(`  Waiting in Google: ${waiting}`);
console.log(`  Not indexed:       ${notIndexed}`);
console.log(`  Unknown:           ${unknown}`);
console.log(`Wrote reports/indexing/latest.json`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '## Indexing report',
    '',
    `- URLs in sitemap: **${urls.length}**`,
    `- GSC sitemap submit: **${report.gsc_sitemap_submit}**`,
    `- IndexNow: **${report.indexnow}**`,
    `- Indexed: **${indexed}** | Waiting: **${waiting}** | Not indexed: **${notIndexed}**`,
    ''
  ].join('\n');
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}
