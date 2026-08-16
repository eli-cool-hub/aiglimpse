#!/usr/bin/env node
/**
 * Send AI Glimpse Daily digest to all verified subscribers via Resend Broadcasts.
 *
 * Required env:
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL   e.g. "AI Glimpse <daily@aiglimpse.ai>"
 *   RESEND_AUDIENCE_ID
 *
 * Optional: SITE_URL (default https://aiglimpse.ai)
 */

import fs from 'fs/promises';
import path from 'path';

const SITE = (process.env.SITE_URL || 'https://aiglimpse.ai').replace(/\/$/, '');
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL;
const segmentId = process.env.RESEND_SEGMENT_ID || process.env.RESEND_AUDIENCE_ID;
const SPONSOR_PATH = path.join(process.cwd(), 'data/newsletter-sponsor.json');

if (process.env.NEWSLETTER_SEND_ENABLED !== 'true' && !process.argv.includes('--force')) {
  console.log('Newsletter sends disabled (collect-only mode). Set NEWSLETTER_SEND_ENABLED=true or pass --force.');
  process.exit(0);
}

if (!apiKey || !from || !segmentId) {
  console.error('RESEND_API_KEY, RESEND_FROM_EMAIL, and RESEND_SEGMENT_ID (or RESEND_AUDIENCE_ID) required');
  process.exit(1);
}

const STATE_PATH = path.join(process.cwd(), 'data/newsletter-state.json');
const PUBLISHED_PATH = path.join(process.cwd(), 'data/published.json');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function pickDigestArticles(articles) {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const recent = articles.filter(a => new Date(a.publishedAt).getTime() >= cutoff);
  const pool = recent.length >= 3 ? recent : articles.slice(0, 8);
  const evergreens = articles.filter(a => a.evergreen);
  const picks = pool.slice(0, 7);
  if (!picks.some(a => a.evergreen) && evergreens[0]) {
    picks.push(evergreens[0]);
  }
  return picks.slice(0, 8);
}

function buildEmailHtml(articles, dateLabel, sponsor) {
  const items = articles.map(a => {
    const url = `${SITE}/articles/${a.slug}`;
    return `<tr>
      <td style="padding: 0 0 20px 0;">
        <a href="${url}" style="color:#111;font-size:17px;font-weight:700;text-decoration:none;line-height:1.35;">${escapeHtml(a.title)}</a>
        ${a.subtitle ? `<p style="margin:6px 0 0 0;color:#555;font-size:15px;line-height:1.5;">${escapeHtml(a.subtitle)}</p>` : ''}
        <p style="margin:8px 0 0 0;"><a href="${url}" style="color:#ff4d2e;font-size:14px;font-weight:600;text-decoration:none;">Read →</a></p>
      </td>
    </tr>`;
  }).join('');

  const sponsorRow = sponsor?.active && sponsor.name && sponsor.url
    ? `<tr><td style="padding:8px 28px 24px 28px;">
        <table role="presentation" width="100%" style="background:#fafaf7;border:1px solid #ececea;border-radius:8px;">
          <tr><td style="padding:16px 18px;">
            <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#888;">${escapeHtml(sponsor.label || 'Sponsor')}</p>
            <a href="${escapeHtml(sponsor.url)}" style="color:#111;font-size:16px;font-weight:700;text-decoration:none;">${escapeHtml(sponsor.name)}</a>
            ${sponsor.blurb ? `<p style="margin:6px 0 0 0;color:#555;font-size:14px;line-height:1.5;">${escapeHtml(sponsor.blurb)}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fafaf7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececea;border-radius:12px;">
        <tr><td style="padding:28px 28px 8px 28px;">
          <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ff4d2e;">AI Glimpse Daily</p>
          <h1 style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:26px;line-height:1.25;color:#111;">${escapeHtml(dateLabel)}</h1>
          <p style="margin:0 0 24px 0;color:#555;font-size:15px;line-height:1.5;">The AI stories that matter, in five minutes.</p>
        </td></tr>
        <tr><td style="padding:0 28px 8px 28px;"><table role="presentation" width="100%">${items}</table></td></tr>
        ${sponsorRow}
        <tr><td style="padding:8px 28px 28px 28px;border-top:1px solid #ececea;">
          <p style="margin:16px 0 0 0;font-size:13px;color:#888;line-height:1.5;">
            <a href="${SITE}/guides" style="color:#888;">Browse explainers</a> ·
            <a href="${SITE}/" style="color:#888;">Visit site</a>
          </p>
          <p style="margin:12px 0 0 0;font-size:12px;color:#aaa;">You're receiving AI Glimpse Daily because you subscribed at aiglimpse.ai. Unsubscribe links are included in each Resend broadcast.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
  } catch {
    return { last_sent_date: null };
  }
}

const today = new Date().toISOString().slice(0, 10);
const state = await loadState();
if (state.last_sent_date === today && !process.argv.includes('--force')) {
  console.log(`Already sent for ${today} — use --force to resend.`);
  process.exit(0);
}

const published = JSON.parse(await fs.readFile(PUBLISHED_PATH, 'utf8'));
const articles = pickDigestArticles(published.articles || []);
if (!articles.length) {
  console.log('No articles to include — skipping send.');
  process.exit(0);
}

const dateLabel = formatDate(new Date());
const subject = `AI Glimpse Daily — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
let sponsor = { active: false };
try { sponsor = JSON.parse(await fs.readFile(SPONSOR_PATH, 'utf8')); } catch { /* none booked */ }
const html = buildEmailHtml(articles, dateLabel, sponsor);

const createRes = await fetch('https://api.resend.com/broadcasts', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    segment_id: segmentId,
    from,
    subject,
    html
  })
});
const created = await createRes.json().catch(() => ({}));
if (!createRes.ok) {
  console.error('Broadcast create failed:', created.message || created.error || createRes.status);
  process.exit(1);
}

const sendRes = await fetch(`https://api.resend.com/broadcasts/${created.id}/send`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` }
});
const sent = await sendRes.json().catch(() => ({}));
if (!sendRes.ok) {
  console.error('Broadcast send failed:', sent.message || sent.error || sendRes.status);
  process.exit(1);
}

state.last_sent_date = today;
state.last_broadcast_id = created.id;
state.article_count = articles.length;
state.sent_at = new Date().toISOString();
await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n');

console.log(`✓ Sent AI Glimpse Daily to audience (${articles.length} stories, broadcast ${created.id})`);
