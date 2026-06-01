// AI Weekly (aiweekly.co) — curated AI news alerts.
//
// Uses their public news sitemap for fresh alert URLs, then reads each alert
// page's JSON-LD to get the original publisher URL (tomshardware, AP, etc.).
// We rewrite from the primary source, not from aiweekly.co itself.

import { XMLParser } from 'fast-xml-parser';

const SITEMAP_URL = 'https://aiweekly.co/news-sitemap.xml';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;
const PAGE_CONCURRENCY = 4;

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true
});

const KEYWORD_CATEGORY = [
  { re: /\b(robot|humanoid|autonomous vehicle|self-driving)\b/i, category: 'robotics' },
  { re: /\b(ethics|regulation|policy|safety|privacy|law|ban|compliance)\b/i, category: 'ethics' },
  { re: /\b(research|paper|benchmark|arxiv|training|model weights)\b/i, category: 'research' },
  { re: /\b(llm|gpt|claude|gemini|chatbot|language model)\b/i, category: 'llms' },
  { re: /\b(hospital|healthcare|clinical|pharma|medical)\b/i, category: 'industry' },
  { re: /\b(chip|semiconductor|data center|infrastructure|capex)\b/i, category: 'industry' }
];

function inferCategory(article) {
  const blob = `${article.headline || ''} ${article.description || ''} ${article.keywords || ''} ${(article.mentions || []).map(m => m.name).join(' ')}`;
  for (const { re, category } of KEYWORD_CATEGORY) {
    if (re.test(blob)) return category;
  }
  return 'business';
}

function extractNewsArticle(html) {
  const match = html.match(/<script type="application\/ld\+json">(\{[\s\S]*?\})<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const nodes = data['@graph'] || [data];
    return nodes.find(n => n['@type'] === 'NewsArticle') || null;
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function mapPool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function fetchAIWeekly(maxAgeHours = 48, maxAlerts = 18) {
  console.log('▶ Fetching AI Weekly alerts...');
  try {
    const xml = await fetchText(SITEMAP_URL);
    const parsed = parser.parse(xml);
    const rows = parsed?.urlset?.url;
    if (!rows) {
      console.warn('  ⚠ AI Weekly: empty sitemap');
      return [];
    }
    const urls = Array.isArray(rows) ? rows : [rows];
    const cutoff = Date.now() - maxAgeHours * 3600 * 1000;

    const candidates = urls
      .filter(row => row?.loc?.includes('/alerts/') && row?.news?.title)
      .map(row => ({
        alertUrl: row.loc,
        title: row.news.title,
        publishedAt: row.news.publication_date || row.news.publication?.date
      }))
      .filter(row => {
        const t = new Date(row.publishedAt).getTime();
        return Number.isFinite(t) && t > cutoff;
      })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, maxAlerts);

    if (!candidates.length) {
      console.log('  ✓ Got 0 fresh AI Weekly alerts');
      return [];
    }

    const items = (await mapPool(candidates, PAGE_CONCURRENCY, async (row) => {
      try {
        const html = await fetchText(row.alertUrl);
        const article = extractNewsArticle(html);
        if (!article) return null;

        const sourceUrl = article.sourceOrganization?.url
          || article.citation?.[0]?.url
          || null;
        if (!sourceUrl || sourceUrl.includes('aiweekly.co')) return null;

        const body = String(article.articleBody || article.description || row.title).trim();
        return {
          title: String(article.headline || row.title).trim(),
          url: sourceUrl,
          publishedAt: new Date(article.datePublished || row.publishedAt).toISOString(),
          summary: String(article.description || body).substring(0, 500),
          body: body.substring(0, 5000),
          source: { title: 'AI Weekly', tier: 2 },
          suggestedCategory: inferCategory(article),
          via: row.alertUrl
        };
      } catch (e) {
        console.warn(`  ⚠ AI Weekly alert ${row.alertUrl}: ${e.message}`);
        return null;
      }
    })).filter(Boolean);

    console.log(`  ✓ Got ${items.length} items from AI Weekly (${candidates.length} alerts checked)`);
    return items;
  } catch (e) {
    console.warn(`  ✗ AI Weekly: ${e.message}`);
    return [];
  }
}
