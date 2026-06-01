// Daily morning briefing: growth trends + operational health checks.
// Runs inside seo-report.mjs and surfaces on the dashboard + markdown report.

import { isAiRelevant } from './ai-relevance.mjs';

const CATEGORY_LABELS = {
  llms: 'LLMs',
  research: 'Research',
  tools: 'Tools',
  business: 'Business',
  ethics: 'Ethics',
  industry: 'Industry',
  robotics: 'Robotics'
};

function pctChange(current, previous) {
  if (previous == null || previous === undefined) return current > 0 ? 100 : 0;
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function fmtPct(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function countByCategory(articles) {
  const out = {};
  for (const a of articles || []) {
    out[a.category] = (out[a.category] || 0) + 1;
  }
  return out;
}

function articlesInLastHours(articles, hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return (articles || []).filter(a => new Date(a.publishedAt).getTime() >= cutoff).length;
}

function hoursSince(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function organicSessions(snapshot) {
  return (snapshot.ga4?.sources || [])
    .filter(s => s.channel === 'Organic Search')
    .reduce((sum, s) => sum + (s.sessions || 0), 0);
}

function scanOffTopic(articles, limit = 30) {
  return (articles || []).slice(0, limit).filter(a => !isAiRelevant({
    title: a.title,
    summary: a.subtitle || '',
    body: '',
    source: { title: a.sourceName, tier: a.sourceTier }
  }, { minScore: 3 }));
}

function buildSummary(status, latest, prev, organic, wins, issues, watches) {
  if (!latest) return 'Not enough history yet for a trend summary.';

  const impr = latest.gsc_impressions_7d ?? 0;
  const sess = latest.ga4_sessions_7d ?? 0;
  const imprDelta = prev ? pctChange(impr, prev.gsc_impressions_7d) : 0;
  const sessDelta = prev ? pctChange(sess, prev.ga4_sessions_7d) : 0;

  const lead = status === 'good'
    ? 'Overall trajectory looks healthy.'
    : status === 'watch'
      ? 'Growth continues but a few items need attention.'
      : 'Several issues need review today.';

  const trend = prev
    ? ` Search visibility ${fmtPct(imprDelta)} DoD (${impr} impressions), traffic ${fmtPct(sessDelta)} DoD (${sess} sessions).`
    : ` ${impr} GSC impressions and ${sess} GA4 sessions in the rolling 7-day window.`;

  const organicBit = organic > 0
    ? ` Organic search contributed ${organic} session(s) this week.`
    : ' Organic search is still minimal while Google indexes new URLs.';

  const tail = issues.length
    ? ` ${issues.length} issue(s) flagged below.`
    : watches.length
      ? ` ${watches.length} item(s) on the watch list.`
      : wins.length
        ? ` ${wins.length} positive signal(s) today.`
        : '';

  return `${lead}${trend}${organicBit}${tail}`;
}

/**
 * @param {{ snapshot: object, history: object, published: object, indexingStatus: object|null }} ctx
 */
export function buildMorningBriefing(ctx) {
  const { snapshot, history, published, indexingStatus } = ctx;
  const daily = history?.daily || [];
  const prev = daily.length >= 2 ? daily[daily.length - 2] : null;
  const latest = daily.length ? daily[daily.length - 1] : null;
  const weekAgo = daily.length >= 8 ? daily[daily.length - 8] : null;

  const issues = [];
  const watches = [];
  const wins = [];

  const organic = organicSessions(snapshot);
  const cats = countByCategory(published?.articles);
  const published24h = articlesInLastHours(published?.articles, 24);
  const published48h = articlesInLastHours(published?.articles, 48);

  // --- Growth (day-over-day) ---
  if (prev && latest) {
    const imprDelta = pctChange(latest.gsc_impressions_7d, prev.gsc_impressions_7d);
    const sessDelta = pctChange(latest.ga4_sessions_7d, prev.ga4_sessions_7d);
    const pvDelta = pctChange(latest.ga4_pageviews_7d, prev.ga4_pageviews_7d);
    const posDelta = latest.gsc_avg_position_7d - prev.gsc_avg_position_7d;

    if (imprDelta >= 8) wins.push(`GSC impressions ${fmtPct(imprDelta)} since yesterday (${prev.gsc_impressions_7d} → ${latest.gsc_impressions_7d}).`);
    else if (imprDelta <= -12) issues.push(`GSC impressions fell ${fmtPct(imprDelta)} since yesterday.`);

    if (sessDelta >= 10) wins.push(`GA4 sessions ${fmtPct(sessDelta)} since yesterday (${prev.ga4_sessions_7d} → ${latest.ga4_sessions_7d}).`);
    else if (sessDelta <= -25 && latest.ga4_sessions_7d >= 5) watches.push(`GA4 sessions ${fmtPct(sessDelta)} since yesterday — check for tracking or traffic source shifts.`);

    if (pvDelta >= 10) wins.push(`Pageviews ${fmtPct(pvDelta)} since yesterday.`);

    if (posDelta <= -0.4) wins.push(`Average search position improved to ${latest.gsc_avg_position_7d.toFixed(1)} (was ${prev.gsc_avg_position_7d.toFixed(1)}).`);
    else if (posDelta >= 0.8) watches.push(`Average search position slipped to ${latest.gsc_avg_position_7d.toFixed(1)} (was ${prev.gsc_avg_position_7d.toFixed(1)}).`);
  }

  // --- Week-over-week ---
  if (weekAgo && latest) {
    const wImpr = pctChange(latest.gsc_impressions_7d, weekAgo.gsc_impressions_7d);
    const wSess = pctChange(latest.ga4_sessions_7d, weekAgo.ga4_sessions_7d);
    if (wImpr >= 25 || wSess >= 25) {
      wins.push(`Week-over-week momentum: impressions ${fmtPct(wImpr)}, sessions ${fmtPct(wSess)}.`);
    }
    if (wImpr <= -20) watches.push(`GSC impressions down ${fmtPct(wImpr)} vs 7 days ago.`);
  }

  // --- Organic vs total traffic ---
  if (organic === 0 && snapshot.ga4.totals.sessions >= 10) {
    watches.push('No organic search sessions in GA4 yet — most traffic is direct/referral while Google indexes.');
  } else if (organic > 0) {
    const share = snapshot.ga4.totals.sessions > 0
      ? Math.round((organic / snapshot.ga4.totals.sessions) * 100)
      : 0;
    wins.push(`${organic} organic search session(s) in 7d (${share}% of traffic).`);
  }

  if (snapshot.gsc.totals.clicks === 0 && snapshot.gsc.totals.impressions >= 40) {
    watches.push(`${snapshot.gsc.totals.impressions} search impressions but 0 clicks — improve titles/meta (see recommendations).`);
  } else if (snapshot.gsc.totals.clicks > 0) {
    wins.push(`${snapshot.gsc.totals.clicks} search click(s) in the last 7 days.`);
  }

  // --- Content pipeline ---
  const totalArticles = published?.articles?.length || 0;
  if (published24h === 0) {
    issues.push('No articles published in the last 24 hours — check Fetch AI News workflow.');
  } else if (published24h < 4) {
    watches.push(`Only ${published24h} article(s) in the last 24h (target ~12–24 at 2/run × 12 runs/day).`);
  } else {
    wins.push(`${published24h} article(s) published in the last 24h — steady cadence.`);
  }

  if (published48h > 0 && published24h === 0) {
    watches.push(`${published48h} article(s) in 48h but none in the last 24h — pipeline may have stalled.`);
  }

  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    if ((cats[cat] || 0) === 0) {
      watches.push(`"${label}" category is empty — add feeds or adjust classification.`);
    }
  }

  const offTopic = scanOffTopic(published?.articles);
  for (const a of offTopic.slice(0, 3)) {
    issues.push(`Possible off-topic article live: "${a.title}" — review or unpublish.`);
  }

  // --- Indexing & sitemap ---
  if (indexingStatus?.updated_at) {
    const ageH = hoursSince(indexingStatus.updated_at);
    if (ageH != null && ageH > 36) {
      watches.push(`Indexing report is ${Math.round(ageH)}h old — daily indexing workflow may have missed a run.`);
    }
    const idx = indexingStatus.summary || {};
    if (idx.indexed > 0) wins.push(`${idx.indexed} URL(s) confirmed indexed in Search Console.`);
    if (idx.unknown >= 20) {
      watches.push(`${idx.unknown} URLs still "unknown" to Google (${idx.indexed || 0} indexed) — normal for a young site, keep submitting sitemap.`);
    }
  } else {
    watches.push('No indexing-status snapshot found — run Submit URLs for indexing workflow.');
  }

  const sitemapUrls = snapshot.sitemap?.submitted_urls || 0;
  if (totalArticles > 0 && sitemapUrls > 0) {
    const gap = Math.abs(sitemapUrls - totalArticles);
    if (gap > totalArticles * 0.15) {
      watches.push(`Sitemap lists ${sitemapUrls} URLs but published index has ${totalArticles} — run indexing refresh.`);
    }
  }

  // --- SEO recommendations backlog ---
  const openRecs = (snapshot.recommendations || []).filter(r => r.status !== 'done');
  const openHigh = openRecs.filter(r => r.priority === 'high');
  if (openHigh.length) {
    watches.push(`${openHigh.length} high-priority SEO recommendation(s) still open.`);
  }
  if (openRecs.length === 0 && (snapshot.recommendations || []).length > 0) {
    wins.push('All SEO recommendations auto-applied — focus on publishing and backlinks.');
  }

  // --- Syndication ---
  const synd = snapshot.syndication || {};
  if (synd.total >= 20) wins.push(`${synd.total} articles syndicated (Dev.to ${synd.devto || 0}, Medium ${synd.medium || 0}).`);
  else if (totalArticles >= 30 && synd.total < 10) {
    watches.push('Low syndication volume — check DEVTO/MEDIUM tokens in GitHub secrets.');
  }

  // --- Overall status ---
  let status = 'good';
  if (issues.length >= 2 || offTopic.length > 0) status = 'concern';
  else if (issues.length >= 1 || watches.length >= 4) status = 'watch';

  const summary = buildSummary(status, latest, prev, organic, wins, issues, watches);

  return {
    status,
    summary,
    organic_sessions_7d: organic,
    issues,
    watches,
    wins,
    operations: {
      articles_total: totalArticles,
      articles_24h: published24h,
      articles_48h: published48h,
      category_counts: cats,
      sitemap_urls: sitemapUrls,
      indexing: indexingStatus?.summary || null,
      indexing_updated_at: indexingStatus?.updated_at || null
    },
    growth: {
      dod_impressions_pct: prev && latest ? pctChange(latest.gsc_impressions_7d, prev.gsc_impressions_7d) : null,
      dod_sessions_pct: prev && latest ? pctChange(latest.ga4_sessions_7d, prev.ga4_sessions_7d) : null,
      dod_pageviews_pct: prev && latest ? pctChange(latest.ga4_pageviews_7d, prev.ga4_pageviews_7d) : null,
      wow_impressions_pct: weekAgo && latest ? pctChange(latest.gsc_impressions_7d, weekAgo.gsc_impressions_7d) : null,
      wow_sessions_pct: weekAgo && latest ? pctChange(latest.ga4_sessions_7d, weekAgo.ga4_sessions_7d) : null
    }
  };
}

export function briefingToMarkdown(briefing) {
  const lines = [];
  const statusLabel = briefing.status === 'good' ? 'Good' : briefing.status === 'watch' ? 'Watch' : 'Needs attention';
  lines.push(`## Morning briefing — ${statusLabel}`);
  lines.push('');
  lines.push(briefing.summary);
  lines.push('');

  const section = (title, items) => {
    if (!items?.length) return;
    lines.push(`### ${title}`);
    lines.push('');
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  };

  section('Wins', briefing.wins);
  section('Watch list', briefing.watches);
  section('Issues', briefing.issues);

  const op = briefing.operations;
  if (op) {
    lines.push('### Operations snapshot');
    lines.push('');
    lines.push(`- Articles on site: **${op.articles_total}** (${op.articles_24h} in last 24h)`);
    lines.push(`- Organic sessions (7d): **${briefing.organic_sessions_7d}**`);
    if (op.indexing) {
      lines.push(`- Indexing: **${op.indexing.indexed || 0}** indexed, **${op.indexing.unknown || 0}** unknown`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
