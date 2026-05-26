// arXiv API, free, authoritative source of AI research papers
// Pulls from cs.AI, cs.LG, cs.CL categories

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV'];

export async function fetchArxiv(maxResults = 15, maxAgeHours = 48) {
  const query = CATEGORIES.map(c => `cat:${c}`).join('+OR+');
  const url = `http://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;

  try {
    console.log('▶ Fetching arXiv papers...');
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AI Glimpse Newsroom Bot/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      console.warn(`  ⚠ arXiv: HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const parsed = parser.parse(xml);

    let entries = parsed.feed?.entry || [];
    if (!Array.isArray(entries)) entries = [entries];

    const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
    const papers = entries
      .map(entry => {
        const authors = Array.isArray(entry.author)
          ? entry.author.map(a => a.name).join(', ')
          : entry.author?.name || 'Unknown';
        return {
          title: String(entry.title || '').replace(/\s+/g, ' ').trim(),
          url: entry.id || '',
          publishedAt: entry.published || new Date().toISOString(),
          summary: String(entry.summary || '').replace(/\s+/g, ' ').trim().substring(0, 600),
          body: `Authors: ${authors}\n\n${String(entry.summary || '').replace(/\s+/g, ' ').trim()}`,
          source: { title: `arXiv (${authors.substring(0, 60)}${authors.length > 60 ? '…' : ''})`, tier: 1 },
          suggestedCategory: 'research'
        };
      })
      .filter(p => p.title && new Date(p.publishedAt).getTime() > cutoff);

    console.log(`  ✓ Got ${papers.length} fresh arXiv papers`);
    return papers;
  } catch (e) {
    console.warn(`  ✗ arXiv: ${e.message}`);
    return [];
  }
}
