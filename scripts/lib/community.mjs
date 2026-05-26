// Hacker News API + GitHub Trending, community signals for AI

const HN_API = 'https://hn.algolia.com/api/v1/search_by_date';

const AI_QUERY_TERMS = [
  'AI', 'artificial intelligence', 'LLM', 'GPT', 'Claude',
  'OpenAI', 'Anthropic', 'machine learning', 'neural network'
];

export async function fetchHackerNews(maxAgeHours = 24, minPoints = 50) {
  console.log('▶ Fetching Hacker News...');
  try {
    const since = Math.floor((Date.now() - maxAgeHours * 3600 * 1000) / 1000);
    const url = `${HN_API}?tags=story&numericFilters=created_at_i>${since},points>${minPoints}&hitsPerPage=30`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'AI Glimpse Newsroom Bot/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      console.warn(`  ⚠ HN: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const items = (data.hits || [])
      .filter(h => {
        const text = `${h.title || ''} ${h.story_text || ''}`.toLowerCase();
        return AI_QUERY_TERMS.some(t => text.includes(t.toLowerCase())) && h.url;
      })
      .map(h => ({
        title: h.title,
        url: h.url,
        publishedAt: new Date(h.created_at).toISOString(),
        summary: h.story_text ? stripHtml(h.story_text).substring(0, 400) : `Trending on Hacker News with ${h.points} points and ${h.num_comments} comments.`,
        body: `${h.title}\n\nHacker News discussion: ${h.points} points, ${h.num_comments} comments.\nDiscussion URL: https://news.ycombinator.com/item?id=${h.objectID}\n\n${stripHtml(h.story_text || '')}`,
        source: { title: `Hacker News (${h.points} pts)`, tier: 2 },
        suggestedCategory: null  // let classifier decide
      }));
    console.log(`  ✓ Got ${items.length} AI-related HN stories`);
    return items;
  } catch (e) {
    console.warn(`  ✗ HN: ${e.message}`);
    return [];
  }
}

// GitHub trending AI repositories
export async function fetchGitHubTrending() {
  console.log('▶ Fetching GitHub trending AI repos...');
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const query = `topic:ai OR topic:llm OR topic:machine-learning OR topic:artificial-intelligence created:>${since}`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'AI Glimpse Newsroom Bot/1.0',
        'Accept': 'application/vnd.github+json'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      console.warn(`  ⚠ GitHub: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const items = (data.items || [])
      .filter(r => r.stargazers_count >= 100)
      .slice(0, 5)
      .map(r => ({
        title: `${r.name}: ${r.description || 'A new AI project on GitHub'}`,
        url: r.html_url,
        publishedAt: new Date(r.created_at).toISOString(),
        summary: r.description || '',
        body: `${r.name}, ${r.description}\n\nLanguage: ${r.language || 'Mixed'}\nStars: ${r.stargazers_count}\nCreated by ${r.owner.login}.`,
        source: { title: `GitHub (${r.stargazers_count}⭐)`, tier: 2 },
        suggestedCategory: 'tools'
      }));
    console.log(`  ✓ Got ${items.length} trending AI repos`);
    return items;
  } catch (e) {
    console.warn(`  ✗ GitHub: ${e.message}`);
    return [];
  }
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
