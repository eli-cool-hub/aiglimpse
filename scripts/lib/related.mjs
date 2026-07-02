// "More from AI Glimpse" module rendered at the bottom of every article.
// Internal linking between articles is one of the strongest on-site SEO
// levers: it gives crawlers dense paths through the archive and keeps
// readers on the site instead of hitting a dead end.

import { pictureHtml } from './media.mjs';

const CATEGORY_META = {
  llms: { tag: 'llm', short: 'LLMs' },
  research: { tag: 'research', short: 'Research' },
  tools: { tag: 'tools', short: 'Tools' },
  business: { tag: 'business', short: 'Business' },
  ethics: { tag: 'ethics', short: 'Ethics' },
  industry: { tag: 'industry', short: 'Industry' },
  robotics: { tag: 'robotics', short: 'Robotics' }
};

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}

/**
 * Pick up to `count` related articles: same category first (newest first),
 * then backfill with the newest articles overall. Excludes the current slug.
 */
export function pickRelated(published, { slug, category }, count = 3) {
  const all = (published?.articles || []).filter(a => a.slug !== slug);
  const same = all.filter(a => a.category === category);
  const rest = all.filter(a => a.category !== category);
  return [...same, ...rest].slice(0, count);
}

function relatedCard(a) {
  const meta = CATEGORY_META[a.category] || CATEGORY_META.tools;
  const href = `/articles/${a.slug}`;
  const img = a.image || '/images/placeholder.svg';
  return `<article class="card card--medium">
            <a href="${href}"><div class="card-image">${pictureHtml(img, a.title, { loading: 'lazy' })}</div></a>
            <div class="card-meta">
              <span class="tag tag--${meta.tag}">${escapeHtml(meta.short)}</span>
              <span class="card-byline"><time datetime="${a.publishedAt}">${displayDate(a.publishedAt)}</time></span>
            </div>
            <a href="${href}"><h3 class="card-title">${escapeHtml(a.title)}</h3></a>
          </article>`;
}

/** Full "More from AI Glimpse" section HTML, or '' if nothing to show. */
export function relatedSectionHtml(published, { slug, category }, count = 3) {
  const picks = pickRelated(published, { slug, category }, count);
  if (!picks.length) return '';
  return `<section class="section" aria-label="Related articles">
      <div class="container container--narrow">
        <div class="section-header">
          <h2 class="section-title">More from AI Glimpse</h2>
          <a href="/categories/${category}" class="section-link">All ${escapeHtml((CATEGORY_META[category] || CATEGORY_META.tools).short)} stories</a>
        </div>
        <div class="grid grid-3">
          ${picks.map(relatedCard).join('\n          ')}
        </div>
      </div>
    </section>`;
}

/** BreadcrumbList JSON-LD for an article page. */
export function breadcrumbSchema(siteUrl, { slug, category, categoryName, title }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: categoryName, item: `${siteUrl}/categories/${category}` },
      { '@type': 'ListItem', position: 3, name: title, item: `${siteUrl}/articles/${slug}` }
    ]
  };
}
