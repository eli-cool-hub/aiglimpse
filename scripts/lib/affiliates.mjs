// Affiliate / partner CTAs for commercial evergreen guides.
// Tracking URLs live in data/affiliates.json so partner IDs can be swapped
// without a code change once programs are approved.

import fs from 'node:fs/promises';
import path from 'node:path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'affiliates.json');

let cached = null;

export async function loadAffiliateConfig() {
  if (cached) return cached;
  try {
    cached = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  } catch {
    cached = { partners: {}, by_slug: {}, disclosure: '' };
  }
  return cached;
}

export function trackedUrl(partner, slug) {
  const raw = partner.affiliate_url || partner.url;
  if (!raw) return '#';
  try {
    const u = new URL(raw);
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'aiglimpse');
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'affiliate');
    if (slug && !u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', slug);
    return u.toString();
  } catch {
    return raw;
  }
}

export function affiliateBoxHtml(slug, config) {
  const entry = config?.by_slug?.[slug];
  if (!entry?.partner_ids?.length) return '';
  const partners = entry.partner_ids
    .map(id => {
      const p = config.partners?.[id];
      if (!p) return null;
      return { ...p, id, href: trackedUrl(p, slug) };
    })
    .filter(Boolean);
  if (!partners.length) return '';

  const cards = partners.map(p => `    <a class="affiliate-card" href="${p.href}" rel="sponsored noopener noreferrer" target="_blank">
      <strong>${escapeHtml(p.name)}</strong>
      <span>${escapeHtml(p.blurb || 'Open product page')}</span>
    </a>`).join('\n');

  return `<aside class="affiliate-box" aria-label="Partner links">
  <p class="affiliate-kicker">Partner links · ${escapeHtml(entry.headline || 'Related tools')}</p>
  <div class="affiliate-grid">
${cards}
  </div>
  <p class="affiliate-note">${escapeHtml(config.disclosure || '')}</p>
</aside>`;
}

export function affiliateDisclosureHtml(slug, config) {
  if (!config?.by_slug?.[slug]) return '';
  const text = config.disclosure || '';
  if (!text) return '';
  return `<p class="affiliate-footer">${escapeHtml(text)} See <a href="/pages/advertise">Advertise</a> and <a href="/pages/editorial">editorial standards</a>.</p>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
