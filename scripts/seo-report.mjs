#!/usr/bin/env node
// Daily SEO + traffic report and dashboard generator.
//
// Pulls Search Console + GA4 numbers as the service account, derives
// recommendations from them, then writes:
//   - reports/seo/YYYY-MM-DD.md      (browsable in GitHub, GITHUB_STEP_SUMMARY)
//   - data/seo-history.json          (30-day rolling KPI history, committed)
//   - dashboard.html                  (embedded snapshot + history + recs)
//
// The dashboard is gated by Basic Auth via functions/_middleware.js so
// committing it to the repo is safe.

import { JWT } from 'google-auth-library';
import fs from 'node:fs/promises';
import path from 'node:path';
import { syndicationStats } from './lib/syndicate.mjs';

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SA_JSON) { console.error('GOOGLE_SERVICE_ACCOUNT_JSON missing'); process.exit(1); }
const creds = JSON.parse(SA_JSON);

const GA4_PROPERTY_ID = '539259808';
const GSC_SITE = 'https://aiglimpse.ai/';

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
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

const today = new Date();
const dISO = today.toISOString().slice(0, 10);
const isoOffset = (days) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

// ----------------------------------------------------------------------
// Fetch raw data
// ----------------------------------------------------------------------

async function getSitemap() {
  const enc = encodeURIComponent(GSC_SITE);
  const r = await api(`https://searchconsole.googleapis.com/webmasters/v3/sites/${enc}/sitemaps`);
  if (r.status !== 200) return { ok: false, error: r.body };
  const list = r.body?.sitemap || [];
  if (list.length === 0) return { ok: true, missing: true };
  const s = list[0];
  const submitted = (s.contents || []).reduce((a, c) => a + Number(c.submitted || 0), 0);
  const indexed = (s.contents || []).reduce((a, c) => a + Number(c.indexed || 0), 0);
  return {
    ok: true,
    path: s.path,
    submitted_urls: submitted,
    indexed_urls: indexed,
    warnings: Number(s.warnings || 0),
    errors: Number(s.errors || 0),
    last_submitted: s.lastSubmitted,
    last_downloaded: s.lastDownloaded
  };
}

async function searchAnalytics(dimensions, rowLimit, days = 7) {
  const enc = encodeURIComponent(GSC_SITE);
  const r = await api(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${enc}/searchAnalytics/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        startDate: isoOffset(days + 1),
        endDate: isoOffset(1),
        dimensions,
        rowLimit
      })
    }
  );
  return r.status === 200 ? (r.body?.rows || []) : [];
}

async function ga4(body) {
  const r = await api(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  return r.status === 200 ? r.body : { rows: [] };
}

console.log('Fetching data...');

const sitemap = await getSitemap();

const [gscTotals7, gscQueries, gscPages, gscCountries, gscDevices, gscDaily30] = await Promise.all([
  searchAnalytics([], 1, 7),
  searchAnalytics(['query'], 25, 7),
  searchAnalytics(['page'], 25, 7),
  searchAnalytics(['country'], 10, 7),
  searchAnalytics(['device'], 5, 7),
  searchAnalytics(['date'], 30, 30)
]);

const [ga4Totals, ga4Pages, ga4Sources, ga4Countries, ga4Devices, ga4Daily30] = await Promise.all([
  ga4({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    metrics: ['sessions', 'totalUsers', 'screenPageViews', 'engagedSessions', 'averageSessionDuration', 'bounceRate'].map(name => ({ name }))
  }),
  ga4({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 25
  }),
  ga4({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 15
  }),
  ga4({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10
  }),
  ga4({
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
  }),
  ga4({
    dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }]
  })
]);

// ----------------------------------------------------------------------
// Shape into snapshot
// ----------------------------------------------------------------------

const snapshot = {
  generated_at: today.toISOString(),
  date: dISO,
  site: GSC_SITE,
  ga4_property: `properties/${GA4_PROPERTY_ID}`,

  sitemap,

  gsc: {
    period: '7 days',
    totals: gscTotals7[0]
      ? {
          clicks: Math.round(gscTotals7[0].clicks),
          impressions: Math.round(gscTotals7[0].impressions),
          ctr: gscTotals7[0].ctr,
          position: gscTotals7[0].position
        }
      : { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    queries: gscQueries.map(r => ({
      key: r.keys[0],
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr: r.ctr,
      position: r.position
    })),
    pages: gscPages.map(r => ({
      key: r.keys[0],
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr: r.ctr,
      position: r.position
    })),
    countries: gscCountries.map(r => ({
      key: r.keys[0],
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions)
    })),
    devices: gscDevices.map(r => ({
      key: r.keys[0],
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions)
    })),
    daily: gscDaily30.map(r => ({
      date: r.keys[0],
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions)
    }))
  },

  ga4: {
    period: '7 days',
    totals: ga4Totals.rows?.[0] ? (() => {
      const v = ga4Totals.rows[0].metricValues.map(m => Number(m.value));
      return {
        sessions: v[0],
        users: v[1],
        pageviews: v[2],
        engaged_sessions: v[3],
        avg_session_duration: v[4],
        bounce_rate: v[5]
      };
    })() : { sessions: 0, users: 0, pageviews: 0, engaged_sessions: 0, avg_session_duration: 0, bounce_rate: 0 },
    pages: (ga4Pages.rows || []).map(r => ({
      path: r.dimensionValues[0].value,
      title: r.dimensionValues[1].value,
      views: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value),
      avg_duration: Number(r.metricValues[2].value)
    })),
    sources: (ga4Sources.rows || []).map(r => ({
      channel: r.dimensionValues[0].value,
      source: r.dimensionValues[1].value,
      sessions: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value)
    })),
    countries: (ga4Countries.rows || []).map(r => ({
      country: r.dimensionValues[0].value,
      sessions: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value)
    })),
    devices: (ga4Devices.rows || []).map(r => ({
      device: r.dimensionValues[0].value,
      sessions: Number(r.metricValues[0].value)
    })),
    daily: (ga4Daily30.rows || []).map(r => ({
      date: r.dimensionValues[0].value,
      sessions: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value),
      pageviews: Number(r.metricValues[2].value)
    }))
  }
};

// ----------------------------------------------------------------------
// Recommendations engine
// ----------------------------------------------------------------------

const recommendations = [];

for (const p of snapshot.gsc.pages) {
  if (p.impressions >= 20 && p.clicks === 0) {
    recommendations.push({
      type: 'low_ctr_page',
      priority: 'high',
      page: p.key,
      message: `${p.impressions} impressions, 0 clicks at position ${p.position.toFixed(1)}. Rewrite the page title and meta description to be more clickable.`
    });
  }
}

for (const p of snapshot.gsc.pages) {
  if (p.impressions >= 10 && p.position >= 8 && p.position <= 15) {
    recommendations.push({
      type: 'near_page_one',
      priority: 'high',
      page: p.key,
      message: `Page is at position ${p.position.toFixed(1)} with ${p.impressions} impressions. Add 2-3 internal links from related articles to push it to page 1.`
    });
  }
}

for (const q of snapshot.gsc.queries) {
  if (q.impressions >= 10 && q.ctr < 0.02 && q.position <= 10) {
    recommendations.push({
      type: 'low_ctr_query',
      priority: 'medium',
      query: q.key,
      message: `Query "${q.key}" gets ${q.impressions} impressions at position ${q.position.toFixed(1)} but ${(q.ctr * 100).toFixed(1)}% CTR. Target this in a future article title.`
    });
  }
}

if (snapshot.sitemap.ok && !snapshot.sitemap.missing) {
  const indexed = snapshot.sitemap.indexed_urls;
  const submitted = snapshot.sitemap.submitted_urls;
  if (submitted > 0 && indexed === 0) {
    recommendations.push({
      type: 'no_indexing_data',
      priority: 'info',
      message: `Sitemap shows 0 indexed URLs of ${submitted} submitted, but this counter often stays empty even after Google indexes pages. Use the URL Inspection tool to confirm.`
    });
  } else if (submitted > 0 && indexed < submitted * 0.5) {
    recommendations.push({
      type: 'low_indexing',
      priority: 'high',
      message: `Only ${indexed}/${submitted} URLs indexed (${Math.round(indexed / submitted * 100)}%). Submit individual URLs via Search Console URL Inspection.`
    });
  }
}

if (snapshot.ga4.totals.sessions === 0) {
  recommendations.push({
    type: 'no_traffic',
    priority: 'info',
    message: 'No GA4 sessions recorded in the last 7 days. Tag is live; this is normal until Google indexes the site and visitors arrive.'
  });
}

if (snapshot.ga4.totals.bounce_rate > 0.75 && snapshot.ga4.totals.sessions >= 20) {
  recommendations.push({
    type: 'high_bounce',
    priority: 'medium',
    message: `Bounce rate is ${(snapshot.ga4.totals.bounce_rate * 100).toFixed(1)}% over ${snapshot.ga4.totals.sessions} sessions. Add more inline links + a "Related articles" block to article pages.`
  });
}

snapshot.recommendations = recommendations;

// Syndication stats
try {
  const synState = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'syndicated.json'), 'utf8'));
  snapshot.syndication = syndicationStats(synState);
} catch {
  snapshot.syndication = { total: 0, medium: 0, devto: 0, hashnode: 0 };
}

// ----------------------------------------------------------------------
// History (30-day rolling KPI series)
// ----------------------------------------------------------------------

const historyPath = path.join(process.cwd(), 'data', 'seo-history.json');
let history;
try { history = JSON.parse(await fs.readFile(historyPath, 'utf8')); }
catch { history = { daily: [] }; }

const todayEntry = {
  date: dISO,
  gsc_clicks_7d: snapshot.gsc.totals.clicks,
  gsc_impressions_7d: snapshot.gsc.totals.impressions,
  gsc_avg_position_7d: snapshot.gsc.totals.position,
  ga4_sessions_7d: snapshot.ga4.totals.sessions,
  ga4_users_7d: snapshot.ga4.totals.users,
  ga4_pageviews_7d: snapshot.ga4.totals.pageviews,
  sitemap_submitted: snapshot.sitemap.submitted_urls || 0,
  sitemap_indexed: snapshot.sitemap.indexed_urls || 0
};
history.daily = history.daily.filter(d => d.date !== dISO);
history.daily.push(todayEntry);
history.daily.sort((a, b) => a.date.localeCompare(b.date));
if (history.daily.length > 365) history.daily = history.daily.slice(-365);

await fs.mkdir(path.dirname(historyPath), { recursive: true });
await fs.writeFile(historyPath, JSON.stringify(history, null, 2));

// ----------------------------------------------------------------------
// Markdown report
// ----------------------------------------------------------------------

const lines = [];
const md = (s) => lines.push(s);

md(`# AI Glimpse SEO + Traffic Report`);
md(`_Generated ${snapshot.generated_at}_`);
md('');
md(`Dashboard: https://aiglimpse.ai/dashboard.html (Basic Auth required)`);
md('');

md('## At a glance (last 7 days)');
md('');
md('| | GSC | GA4 |');
md('|---|---:|---:|');
md(`| Clicks | ${snapshot.gsc.totals.clicks} | - |`);
md(`| Impressions | ${snapshot.gsc.totals.impressions} | - |`);
md(`| Avg position | ${snapshot.gsc.totals.position.toFixed(1)} | - |`);
md(`| Sessions | - | ${snapshot.ga4.totals.sessions} |`);
md(`| Users | - | ${snapshot.ga4.totals.users} |`);
md(`| Pageviews | - | ${snapshot.ga4.totals.pageviews} |`);
md('');

if (snapshot.sitemap.ok && !snapshot.sitemap.missing) {
  md('## Sitemap');
  md('');
  md(`- Submitted URLs: **${snapshot.sitemap.submitted_urls}**`);
  md(`- Indexed URLs: **${snapshot.sitemap.indexed_urls}**`);
  md(`- Errors: ${snapshot.sitemap.errors}`);
  md(`- Last downloaded: ${snapshot.sitemap.last_downloaded}`);
  md('');
}

if (recommendations.length > 0) {
  md('## Recommendations');
  md('');
  for (const r of recommendations) {
    md(`- **[${r.priority}]** ${r.message}`);
  }
  md('');
}

if (snapshot.gsc.queries.length > 0) {
  md('## Top queries (GSC, 7d)');
  md('');
  md('| Query | Clicks | Impressions | CTR | Position |');
  md('|---|---:|---:|---:|---:|');
  for (const q of snapshot.gsc.queries.slice(0, 15)) {
    md(`| ${q.key} | ${q.clicks} | ${q.impressions} | ${(q.ctr * 100).toFixed(1)}% | ${q.position.toFixed(1)} |`);
  }
  md('');
}

if (snapshot.gsc.pages.length > 0) {
  md('## Top landing pages (GSC, 7d)');
  md('');
  md('| Page | Clicks | Impressions | CTR | Position |');
  md('|---|---:|---:|---:|---:|');
  for (const p of snapshot.gsc.pages.slice(0, 15)) {
    md(`| ${p.key.replace(GSC_SITE, '/')} | ${p.clicks} | ${p.impressions} | ${(p.ctr * 100).toFixed(1)}% | ${p.position.toFixed(1)} |`);
  }
  md('');
}

if (snapshot.ga4.pages.length > 0) {
  md('## Top pages (GA4, 7d)');
  md('');
  md('| Page | Views | Users |');
  md('|---|---:|---:|');
  for (const p of snapshot.ga4.pages.slice(0, 15)) {
    md(`| ${p.path} | ${p.views} | ${p.users} |`);
  }
  md('');
}

if (snapshot.ga4.sources.length > 0) {
  md('## Traffic sources (GA4, 7d)');
  md('');
  md('| Channel | Source | Sessions | Users |');
  md('|---|---|---:|---:|');
  for (const s of snapshot.ga4.sources) {
    md(`| ${s.channel} | ${s.source} | ${s.sessions} | ${s.users} |`);
  }
  md('');
}

const markdown = lines.join('\n');
const reportDir = path.join(process.cwd(), 'reports', 'seo');
await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(path.join(reportDir, `${dISO}.md`), markdown);
await fs.writeFile(path.join(reportDir, 'latest.md'), markdown);
console.log(`Wrote reports/seo/${dISO}.md`);

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}

// ----------------------------------------------------------------------
// Dashboard HTML
// ----------------------------------------------------------------------

const dashboardTpl = await fs.readFile(path.join(process.cwd(), 'scripts', 'templates', 'dashboard.html'), 'utf8');
const dashboard = dashboardTpl
  .replace('/*__SNAPSHOT__*/null', JSON.stringify(snapshot))
  .replace('/*__HISTORY__*/null', JSON.stringify(history));

await fs.writeFile(path.join(process.cwd(), 'dashboard.html'), dashboard);
console.log('Wrote dashboard.html');
console.log(`Snapshot: ${snapshot.gsc.totals.impressions} GSC impressions, ${snapshot.ga4.totals.sessions} GA4 sessions, ${recommendations.length} recommendations`);
