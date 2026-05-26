// NewsAPI.ai (Event Registry), aggregator source
// Backup / breadth source. Optional, pipeline works without an API key.

export async function fetchNewsAPI(apiKey, maxAgeHours = 24) {
  if (!apiKey) {
    console.log('▶ NewsAPI.ai: no key, skipping');
    return [];
  }
  console.log('▶ Fetching NewsAPI.ai...');
  try {
    const url = 'https://eventregistry.org/api/v1/article/getArticles';
    const body = {
      action: 'getArticles',
      keyword: ['artificial intelligence', 'AI model', 'LLM', 'OpenAI', 'Anthropic', 'machine learning'],
      keywordOper: 'or',
      lang: 'eng',
      articlesPage: 1,
      articlesCount: 25,
      articlesSortBy: 'date',
      articlesSortByAsc: false,
      dataType: ['news'],
      apiKey
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) {
      console.warn(`  ⚠ NewsAPI: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
    const items = (data?.articles?.results || [])
      .filter(a => a.title && a.url && new Date(a.dateTime || a.date).getTime() > cutoff)
      .map(a => ({
        title: a.title,
        url: a.url,
        publishedAt: a.dateTime || a.date || new Date().toISOString(),
        summary: (a.body || '').substring(0, 500),
        body: a.body || '',
        source: { title: a.source?.title || 'NewsAPI.ai', tier: 3 },
        suggestedCategory: null
      }));
    console.log(`  ✓ Got ${items.length} items from NewsAPI.ai`);
    return items;
  } catch (e) {
    console.warn(`  ✗ NewsAPI: ${e.message}`);
    return [];
  }
}
