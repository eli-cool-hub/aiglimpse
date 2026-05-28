#!/usr/bin/env node
// Daily SEO + traffic report. Pulls from:
//   - Search Console (Search Analytics API)
//   - Search Console (Sitemaps API)
//   - GA4 Data API
//
// Writes a markdown report to reports/seo/YYYY-MM-DD.md and prints the
// same markdown to GITHUB_STEP_SUMMARY so it shows up in the workflow run
// page. Runs as the service account so no human OAuth is involved.

import { JWT } from 'google-auth-library';
import fs from 'node:fs/promises';
import path from 'node:path';

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SA_JSON) { console.error('GOOGLE_SERVICE_ACCOUNT_JSON missing'); process.exit(1); }
const creds = JSON.parse(SA_JSON);

const GA4_PROPERTY_ID = '539259808';
const GSC_SITE = 'https://aiglimpse.ai/';
const SITEMAP_URL = 'https://aiglimpse.ai/sitemap.xml';

const jwt = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/analytics.readonly'
  ]
});
await jwt.authorize();
const token = jwt.credentials.access_token;

async function api(url, opts = {}) {
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
  return { status: res.status, body };
}

const today = new Date();
const dISO = today.toISOString().slice(0, 10);
const isoOffset = (days) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const sections = [];
sections.push(`# AI Glimpse SEO + Traffic Report`);
sections.push(`_Generated ${today.toISOString()}_`);
sections.push('');

// ===== Search Console: sitemap status =====
sections.push('## Sitemap status');
{
  const enc = encodeURIComponent(GSC_SITE);
  const r = await api(`https://searchconsole.googleapis.com/webmasters/v3/sites/${enc}/sitemaps`);
  if (r.status === 200 && (r.body?.sitemap || []).length > 0) {
    sections.push('');
    sections.push('| Path | Submitted | Last downloaded | Indexed URLs | Submitted URLs | Warnings | Errors |');
    sections.push('|---|---|---|---|---|---|---|');
    for (const s of r.body.sitemap) {
      const indexed = (s.contents || []).reduce((acc, c) => acc + Number(c.indexed || 0), 0);
      const submitted = (s.contents || []).reduce((acc, c) => acc + Number(c.submitted || 0), 0);
      sections.push(`| ${s.path.replace(GSC_SITE, '/')} | ${s.lastSubmitted || '-'} | ${s.lastDownloaded || '-'} | ${indexed || '-'} | ${submitted || '-'} | ${s.warnings || 0} | ${s.errors || 0} |`);
    }
  } else if (r.status === 200) {
    sections.push('');
    sections.push('_No sitemap submitted yet. Submit https://aiglimpse.ai/sitemap.xml at https://search.google.com/search-console/sitemaps_');
  } else {
    sections.push('');
    sections.push('```');
    sections.push(`Status ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    sections.push('```');
  }
}
sections.push('');

// ===== Search Console: search analytics, last 7 days =====
async function searchAnalytics(dimensions, rowLimit = 10) {
  const enc = encodeURIComponent(GSC_SITE);
  const r = await api(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${enc}/searchAnalytics/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        startDate: isoOffset(7),
        endDate: isoOffset(1),
        dimensions,
        rowLimit
      })
    }
  );
  return r;
}

sections.push('## Search Console - last 7 days');

{
  const r = await searchAnalytics([], 1);
  if (r.status === 200 && (r.body?.rows || []).length > 0) {
    const t = r.body.rows[0];
    sections.push('');
    sections.push(`- **Clicks**: ${Math.round(t.clicks).toLocaleString()}`);
    sections.push(`- **Impressions**: ${Math.round(t.impressions).toLocaleString()}`);
    sections.push(`- **CTR**: ${(t.ctr * 100).toFixed(2)}%`);
    sections.push(`- **Average position**: ${t.position.toFixed(1)}`);
  } else if (r.status === 200) {
    sections.push('');
    sections.push('_No search traffic yet. Google indexes the site but no queries have driven impressions in the last 7 days. Normal for a brand new site._');
  } else {
    sections.push('');
    sections.push('```');
    sections.push(`Status ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    sections.push('```');
  }
}
sections.push('');

sections.push('### Top queries');
{
  const r = await searchAnalytics(['query'], 15);
  const rows = r.body?.rows || [];
  if (rows.length > 0) {
    sections.push('');
    sections.push('| Query | Clicks | Impressions | CTR | Position |');
    sections.push('|---|---:|---:|---:|---:|');
    for (const row of rows) {
      sections.push(`| ${row.keys[0]} | ${Math.round(row.clicks)} | ${Math.round(row.impressions)} | ${(row.ctr * 100).toFixed(1)}% | ${row.position.toFixed(1)} |`);
    }
  } else {
    sections.push('');
    sections.push('_No query data yet._');
  }
}
sections.push('');

sections.push('### Top landing pages');
{
  const r = await searchAnalytics(['page'], 15);
  const rows = r.body?.rows || [];
  if (rows.length > 0) {
    sections.push('');
    sections.push('| Page | Clicks | Impressions | CTR | Position |');
    sections.push('|---|---:|---:|---:|---:|');
    for (const row of rows) {
      sections.push(`| ${row.keys[0].replace(GSC_SITE, '/')} | ${Math.round(row.clicks)} | ${Math.round(row.impressions)} | ${(row.ctr * 100).toFixed(1)}% | ${row.position.toFixed(1)} |`);
    }
  } else {
    sections.push('');
    sections.push('_No page-level data yet._');
  }
}
sections.push('');

sections.push('### Country breakdown');
{
  const r = await searchAnalytics(['country'], 10);
  const rows = r.body?.rows || [];
  if (rows.length > 0) {
    sections.push('');
    sections.push('| Country | Clicks | Impressions |');
    sections.push('|---|---:|---:|');
    for (const row of rows) {
      sections.push(`| ${row.keys[0].toUpperCase()} | ${Math.round(row.clicks)} | ${Math.round(row.impressions)} |`);
    }
  } else {
    sections.push('');
    sections.push('_No country data yet._');
  }
}
sections.push('');

// ===== GA4 =====
async function ga4Report(body) {
  return api(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

sections.push('## Google Analytics - last 7 days');

{
  const r = await ga4Report({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
      { name: 'engagedSessions' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' }
    ]
  });
  if (r.status === 200 && r.body?.rows?.length > 0) {
    const row = r.body.rows[0].metricValues;
    sections.push('');
    sections.push(`- **Sessions**: ${Number(row[0].value).toLocaleString()}`);
    sections.push(`- **Users**: ${Number(row[1].value).toLocaleString()}`);
    sections.push(`- **Pageviews**: ${Number(row[2].value).toLocaleString()}`);
    sections.push(`- **Engaged sessions**: ${Number(row[3].value).toLocaleString()}`);
    sections.push(`- **Avg session duration**: ${Number(row[4].value).toFixed(1)}s`);
    sections.push(`- **Bounce rate**: ${(Number(row[5].value) * 100).toFixed(1)}%`);
  } else if (r.status === 200) {
    sections.push('');
    sections.push('_No traffic recorded in GA4 for the last 7 days yet. Tag is live; wait for visitors._');
  } else {
    sections.push('');
    sections.push('```');
    sections.push(`Status ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`);
    sections.push('```');
  }
}
sections.push('');

sections.push('### Top pages');
{
  const r = await ga4Report({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 15
  });
  const rows = r.body?.rows || [];
  if (rows.length > 0) {
    sections.push('');
    sections.push('| Page | Views | Users | Avg duration |');
    sections.push('|---|---:|---:|---:|');
    for (const row of rows) {
      sections.push(`| ${row.dimensionValues[0].value} | ${Number(row.metricValues[0].value).toLocaleString()} | ${Number(row.metricValues[1].value).toLocaleString()} | ${Number(row.metricValues[2].value).toFixed(1)}s |`);
    }
  } else {
    sections.push('');
    sections.push('_No page data yet._');
  }
}
sections.push('');

sections.push('### Traffic sources');
{
  const r = await ga4Report({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 15
  });
  const rows = r.body?.rows || [];
  if (rows.length > 0) {
    sections.push('');
    sections.push('| Channel | Source | Sessions | Users |');
    sections.push('|---|---|---:|---:|');
    for (const row of rows) {
      sections.push(`| ${row.dimensionValues[0].value} | ${row.dimensionValues[1].value} | ${Number(row.metricValues[0].value).toLocaleString()} | ${Number(row.metricValues[1].value).toLocaleString()} |`);
    }
  } else {
    sections.push('');
    sections.push('_No source data yet._');
  }
}
sections.push('');

sections.push('### Country breakdown');
{
  const r = await ga4Report({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10
  });
  const rows = r.body?.rows || [];
  if (rows.length > 0) {
    sections.push('');
    sections.push('| Country | Sessions | Users |');
    sections.push('|---|---:|---:|');
    for (const row of rows) {
      sections.push(`| ${row.dimensionValues[0].value} | ${Number(row.metricValues[0].value).toLocaleString()} | ${Number(row.metricValues[1].value).toLocaleString()} |`);
    }
  } else {
    sections.push('');
    sections.push('_No country data yet._');
  }
}
sections.push('');

const markdown = sections.join('\n');

// Write file
const dir = path.join(process.cwd(), 'reports', 'seo');
await fs.mkdir(dir, { recursive: true });
const filePath = path.join(dir, `${dISO}.md`);
await fs.writeFile(filePath, markdown);
console.log(`Wrote ${filePath}`);

// Update latest pointer for quick access
await fs.writeFile(path.join(dir, 'latest.md'), markdown);

// Append to step summary if running in GitHub Actions
if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}

console.log('\n--- report preview ---\n');
console.log(markdown.slice(0, 2000));
