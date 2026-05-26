// RSS source aggregator, fetches from official AI company blogs and quality publications
// Free. Hours faster than aggregators. Authoritative.
//
// IMPORTANT: Many publishers (Substack, Cloudflare-fronted sites, some CDNs) block
// obvious bot User-Agents with 403 or 404. We use a real browser UA + Accept headers
// to look like a normal reader fetching the feed.

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Disable entity expansion entirely. Some publisher feeds (Google Blogger via
  // FeedBurner, for example) exceed the default 1000-entity limit. We don't rely
  // on HTML entity decoding here anyway, stripHtml() handles that downstream.
  processEntities: false
});

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Curated RSS feeds. Diversified across 7 categories so the homepage doesn't get
// dominated by a single topic when arXiv has a busy day.
//
// Removed (no longer publish RSS): Anthropic, Mistral AI, Meta AI.
// Replaced with quality substacks + Crunchbase + dedicated robotics feeds.
export const RSS_SOURCES = [
  // === Tier 1: Frontier labs and authoritative publishers ===
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', tier: 1, category: 'llms' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', tier: 1, category: 'research' },
  { name: 'Google AI Blog', url: 'https://feeds.feedburner.com/blogspot/gJZg', tier: 1, category: 'research' },
  { name: 'Microsoft AI', url: 'https://blogs.microsoft.com/ai/feed/', tier: 1, category: 'business' },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', tier: 1, category: 'tools' },

  // === Tier 2: Quality AI-focused publications ===
  { name: 'MIT Technology Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', tier: 2, category: 'research' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', tier: 2, category: 'business' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', tier: 2, category: 'tools' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', tier: 2, category: 'business' },
  { name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/', tier: 2, category: 'tools' },
  { name: 'Wired AI', url: 'https://www.wired.com/feed/tag/ai/latest/rss', tier: 2, category: 'tools' },
  { name: 'IEEE Spectrum AI', url: 'https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss', tier: 2, category: 'research' },
  { name: 'IEEE Spectrum Robotics', url: 'https://spectrum.ieee.org/feeds/topic/robotics.rss', tier: 2, category: 'robotics' },
  { name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', tier: 2, category: 'business' },

  // === Tier 3: Specialized + community ===
  { name: 'Import AI (Jack Clark)', url: 'https://importai.substack.com/feed', tier: 3, category: 'research' },
  { name: 'The Gradient', url: 'https://thegradient.pub/rss/', tier: 3, category: 'research' },
  { name: 'Stratechery', url: 'https://stratechery.com/feed/', tier: 3, category: 'business' },
  { name: 'Interconnects (Nathan Lambert)', url: 'https://www.interconnects.ai/feed', tier: 3, category: 'llms' },
  { name: 'The Algorithmic Bridge', url: 'https://thealgorithmicbridge.substack.com/feed', tier: 3, category: 'llms' },
  { name: 'One Useful Thing (Ethan Mollick)', url: 'https://www.oneusefulthing.org/feed', tier: 3, category: 'llms' },
  { name: 'AI Snake Oil', url: 'https://www.aisnakeoil.com/feed', tier: 3, category: 'ethics' },
  { name: 'Robohub', url: 'https://robohub.org/feed/', tier: 3, category: 'robotics' },
  { name: 'The Robot Report', url: 'https://www.therobotreport.com/feed/', tier: 3, category: 'robotics' },
];

// Parse a single RSS or Atom feed
async function parseFeed(source) {
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    });
    if (!res.ok) {
      console.warn(`  ⚠ ${source.name}: HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const parsed = parser.parse(xml);

    // Detect RSS vs Atom
    let items = [];
    if (parsed.rss?.channel?.item) {
      items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
    } else if (parsed.feed?.entry) {
      items = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
    } else if (parsed['rdf:RDF']?.item) {
      items = Array.isArray(parsed['rdf:RDF'].item) ? parsed['rdf:RDF'].item : [parsed['rdf:RDF'].item];
    }

    return items.slice(0, 10).map(item => normalizeItem(item, source));
  } catch (e) {
    console.warn(`  ✗ ${source.name}: ${e.message}`);
    return [];
  }
}

function normalizeItem(item, source) {
  // Handle both RSS and Atom field structures
  const title = extractText(item.title);
  const link = typeof item.link === 'string' ? item.link
    : item.link?.['@_href'] || item.link?.['#text']
    || item.guid?.['#text'] || item.guid || '';
  const pubDate = item.pubDate || item.published || item.updated || item['dc:date'] || '';
  const description = extractText(item.description || item.summary || item['content:encoded'] || item.content || '');
  const body = extractText(item['content:encoded'] || item.content || item.description || item.summary || '');

  return {
    title: title.trim(),
    url: typeof link === 'string' ? link.trim() : '',
    publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    summary: stripHtml(description).substring(0, 500),
    body: stripHtml(body).substring(0, 5000),
    source: { title: source.name, tier: source.tier },
    suggestedCategory: source.category
  };
}

function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (field['#text']) return field['#text'];
  if (typeof field === 'object') return JSON.stringify(field);
  return String(field);
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch all sources in parallel
export async function fetchAllRSS(maxAgeHours = 48) {
  console.log(`▶ Fetching ${RSS_SOURCES.length} RSS feeds in parallel...`);
  const results = await Promise.all(RSS_SOURCES.map(parseFeed));
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  const all = results.flat().filter(item => {
    return item.title && item.url && new Date(item.publishedAt).getTime() > cutoff;
  });
  console.log(`  ✓ Got ${all.length} fresh items from RSS sources`);
  return all;
}
