#!/usr/bin/env node
/**
 * Diagnostic — fetch from all sources, report counts, do NOT publish.
 * Use this to verify everything works before enabling the workflow.
 *
 * Run: npm run test-sources
 */

import { fetchAllRSS } from './lib/rss-sources.mjs';
import { fetchArxiv } from './lib/arxiv.mjs';
import { fetchHackerNews, fetchGitHubTrending } from './lib/community.mjs';
import { fetchNewsAPI } from './lib/newsapi.mjs';
import { deduplicate } from './lib/dedupe.mjs';

async function main() {
  console.log('🔍 AI Glimpse — Source Diagnostic\n');

  const [rss, arxiv, hn, github, newsapi] = await Promise.all([
    fetchAllRSS(48),
    fetchArxiv(15, 48),
    fetchHackerNews(24, 50),
    fetchGitHubTrending(),
    fetchNewsAPI(process.env.NEWSAPI_KEY, 24)
  ]);

  console.log('\n📊 Source Counts:');
  console.log(`  RSS feeds:        ${rss.length}`);
  console.log(`  arXiv papers:     ${arxiv.length}`);
  console.log(`  Hacker News:      ${hn.length}`);
  console.log(`  GitHub trending:  ${github.length}`);
  console.log(`  NewsAPI.ai:       ${newsapi.length}`);
  console.log(`  ─────────────────────────`);
  const all = [...rss, ...arxiv, ...hn, ...github, ...newsapi];
  console.log(`  Total raw:        ${all.length}`);

  const unique = deduplicate(all);
  console.log(`  After dedupe:     ${unique.length}\n`);

  // Show top 10 by tier
  const top = unique.sort((a, b) => (a.source.tier || 99) - (b.source.tier || 99)).slice(0, 10);
  console.log('🏆 Top 10 candidates (by source authority):\n');
  top.forEach((item, i) => {
    console.log(`  ${i+1}. [T${item.source.tier} · ${item.source.title}]`);
    console.log(`     ${item.title.substring(0, 100)}`);
    console.log('');
  });
}

main().catch(e => { console.error(e); process.exit(1); });
