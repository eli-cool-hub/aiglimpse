// Shared sitemap generation and URL collection for indexing workflows.
//
// Google News sitemaps may only contain articles from the last two days.
// Mixing months of news:news tags into the main sitemap is a documented
// reason Google ignores the file. We therefore emit:
//   sitemap.xml          — sitemap index
//   sitemap-pages.xml    — hubs, categories, static pages
//   sitemap-articles.xml — every article, no news extension
//   sitemap-news.xml     — last 48h only, with news:news tags

import fs from 'node:fs/promises';
import path from 'node:path';

export const CATEGORY_SLUGS = ['llms', 'research', 'tools', 'business', 'ethics', 'industry', 'robotics'];

// Articles per category page; shared with scripts/build-categories.mjs so the
// sitemap and the actual pagination never disagree.
export const CATEGORY_PER_PAGE = 18;

export const NEWS_SITEMAP_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// Legal / rarely-edited pages. Updating lastmod to "today" on every publish
// run looks like sitemap spam and trains Google to distrust lastmod.
const STATIC_LASTMOD = {
  '/pages/privacy': '2026-05-27',
  '/pages/terms': '2026-05-27',
  '/pages/advertise': '2026-05-27',
  '/pages/editorial': '2026-06-01',
  '/pages/about': '2026-06-01',
  '/pages/contact': '2026-06-01'
};

export const SITEMAP_FILES = [
  'sitemap.xml',
  'sitemap-pages.xml',
  'sitemap-articles.xml',
  'sitemap-news.xml'
];

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isoDay(iso) {
  return String(iso).substring(0, 10);
}

function urlsetXml(entries, extraXmlns = '') {
  const ns = extraXmlns
    ? `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ${extraXmlns}`
    : 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${ns}>
${entries.join('\n')}
</urlset>`;
}

function urlXml({ loc, lastmod, changefreq, priority, news }) {
  const newsBlock = news
    ? `
    <news:news>
      <news:publication><news:name>AI Glimpse</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${news.publishedAt}</news:publication_date>
      <news:title>${escapeHtml(news.title)}</news:title>
    </news:news>`
    : '';
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>${newsBlock}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

// Paginated category URLs beyond page 1 (/categories/llms-2, ...).
export function categoryPaginationUrls(published, siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  const counts = {};
  for (const a of published?.articles || []) {
    counts[a.category] = (counts[a.category] || 0) + 1;
  }
  const urls = [];
  for (const slug of CATEGORY_SLUGS) {
    const pages = Math.ceil((counts[slug] || 0) / CATEGORY_PER_PAGE);
    for (let p = 2; p <= pages; p++) {
      urls.push({ loc: `${base}/categories/${slug}-${p}`, priority: 0.6, changefreq: 'daily' });
    }
  }
  return urls;
}

export function staticSitemapUrls(siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  return [
    { loc: `${base}/`, priority: 1.0, changefreq: 'hourly' },
    ...CATEGORY_SLUGS.map(c => ({ loc: `${base}/categories/${c}`, priority: 0.9, changefreq: 'hourly' })),
    { loc: `${base}/guides`, priority: 0.95, changefreq: 'weekly' },
    { loc: `${base}/pages/about`, priority: 0.5, changefreq: 'monthly' },
    { loc: `${base}/pages/contact`, priority: 0.5, changefreq: 'monthly' },
    { loc: `${base}/pages/editorial`, priority: 0.4, changefreq: 'monthly' },
    { loc: `${base}/pages/advertise`, priority: 0.3, changefreq: 'monthly' },
    { loc: `${base}/pages/privacy`, priority: 0.3, changefreq: 'yearly' },
    { loc: `${base}/pages/terms`, priority: 0.3, changefreq: 'yearly' }
  ];
}

export function collectIndexableUrls(published, siteUrl = 'https://aiglimpse.ai') {
  const base = siteUrl.replace(/\/$/, '');
  const urls = [
    ...staticSitemapUrls(base).map(u => u.loc),
    ...categoryPaginationUrls(published, base).map(u => u.loc)
  ];
  for (const a of published.articles || []) {
    urls.push(`${base}/articles/${a.slug}`);
  }
  return [...new Set(urls)];
}

export function recentNewsArticles(published, now = new Date()) {
  const cutoff = now.getTime() - NEWS_SITEMAP_MAX_AGE_MS;
  return (published.articles || []).filter(a => {
    const t = Date.parse(a.publishedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
}

export async function regenerateSitemap(published, siteUrl = 'https://aiglimpse.ai', root = process.cwd()) {
  const base = siteUrl.replace(/\/$/, '');
  const articles = published.articles || [];
  const newestIso = articles[0]?.publishedAt || new Date().toISOString();
  const nowIso = new Date().toISOString();
  const pageLastmod = isoDay(newestIso);

  const pageEntries = [...staticSitemapUrls(base), ...categoryPaginationUrls(published, base)].map(u => {
    const pathPart = u.loc.replace(base, '') || '/';
    const lastmod = STATIC_LASTMOD[pathPart] || pageLastmod;
    return urlXml({ ...u, lastmod });
  });

  const articleEntries = articles.map(a => urlXml({
    loc: `${base}/articles/${a.slug}`,
    lastmod: isoDay(a.publishedAt),
    changefreq: a.evergreen ? 'weekly' : 'daily',
    priority: a.evergreen ? '0.9' : '0.7'
  }));

  const newsEntries = recentNewsArticles(published).map(a => urlXml({
    loc: `${base}/articles/${a.slug}`,
    lastmod: isoDay(a.publishedAt),
    changefreq: 'hourly',
    priority: '0.9',
    news: { publishedAt: a.publishedAt, title: a.title }
  }));

  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap-pages.xml</loc><lastmod>${pageLastmod}</lastmod></sitemap>
  <sitemap><loc>${base}/sitemap-articles.xml</loc><lastmod>${pageLastmod}</lastmod></sitemap>
  <sitemap><loc>${base}/sitemap-news.xml</loc><lastmod>${isoDay(nowIso)}</lastmod></sitemap>
</sitemapindex>`;

  await Promise.all([
    fs.writeFile(path.join(root, 'sitemap.xml'), indexXml),
    fs.writeFile(path.join(root, 'sitemap-pages.xml'), urlsetXml(pageEntries)),
    fs.writeFile(path.join(root, 'sitemap-articles.xml'), urlsetXml(articleEntries)),
    fs.writeFile(
      path.join(root, 'sitemap-news.xml'),
      urlsetXml(newsEntries, 'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"')
    )
  ]);

  return collectIndexableUrls(published, base);
}

export async function pingIndexNow(urls, siteUrl = 'https://aiglimpse.ai') {
  const key = process.env.INDEXNOW_KEY;
  if (!key || !urls.length) return { ok: false, skipped: true, reason: 'INDEXNOW_KEY missing or no URLs' };

  const base = siteUrl.replace(/\/$/, '');
  const host = new URL(base).hostname;
  const body = {
    host,
    key,
    keyLocation: `${base}/${key}.txt`,
    urlList: [...new Set(urls)].slice(0, 10000)
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
      return { ok: false, status: res.status, body: await res.text() };
    }
    return { ok: true, status: res.status, count: body.urlList.length };
  } catch (err) {
    return { ok: false, status: 0, body: String(err?.message || err) };
  }
}
