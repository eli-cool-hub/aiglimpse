// Shared sitemap generation and URL collection for indexing workflows.

import fs from 'node:fs/promises';
import path from 'node:path';

export const CATEGORY_SLUGS = ['llms', 'research', 'tools', 'business', 'ethics', 'industry', 'robotics'];

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function staticSitemapUrls(siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  return [
    { loc: `${base}/`, priority: 1.0, changefreq: 'hourly' },
    ...CATEGORY_SLUGS.map(c => ({ loc: `${base}/categories/${c}`, priority: 0.9, changefreq: 'hourly' })),
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
  const urls = staticSitemapUrls(base).map(u => u.loc);
  for (const a of published.articles || []) {
    urls.push(`${base}/articles/${a.slug}`);
  }
  return [...new Set(urls)];
}

export async function regenerateSitemap(published, siteUrl = 'https://aiglimpse.ai', root = process.cwd()) {
  const base = siteUrl.replace(/\/$/, '');
  const recent = (published.articles || []).slice(0, 1000);
  const staticUrls = staticSitemapUrls(base);

  const articleEntries = recent.map(a => `  <url>
    <loc>${base}/articles/${a.slug}</loc>
    <news:news>
      <news:publication><news:name>AI Glimpse</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${a.publishedAt}</news:publication_date>
      <news:title>${escapeHtml(a.title)}</news:title>
    </news:news>
    <changefreq>daily</changefreq><priority>${a.evergreen ? '0.9' : '0.8'}</priority>
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${staticUrls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
${articleEntries}
</urlset>`;

  await fs.writeFile(path.join(root, 'sitemap.xml'), xml);
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
    urlList: urls.slice(0, 10000)
  };

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }
  return { ok: true, status: res.status, count: body.urlList.length };
}
