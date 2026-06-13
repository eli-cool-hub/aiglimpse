/** Newsletter helpers for Cloudflare Pages Functions (Web Crypto). */

const TTL_MS = 24 * 60 * 60 * 1000;
const UNSUB_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function createToken(email, secret, { purpose = 'verify', ttlMs = TTL_MS } = {}) {
  const e = normalizeEmail(email);
  const exp = Date.now() + ttlMs;
  const payload = `${purpose}\n${e}\n${exp}`;
  const sig = await hmacHex(secret, payload);
  return b64urlEncode(JSON.stringify({ p: purpose, e, exp, sig }));
}

export async function parseToken(token, secret, expectedPurpose = 'verify') {
  if (!token || !secret) return null;
  let obj;
  try {
    obj = JSON.parse(b64urlDecode(token));
  } catch {
    return null;
  }
  const { p, e, exp, sig } = obj;
  if (p !== expectedPurpose || !e || typeof exp !== 'number' || typeof sig !== 'string') return null;
  if (exp < Date.now()) return null;
  const payload = `${p}\n${e}\n${exp}`;
  const expected = await hmacHex(secret, payload);
  if (!safeEqual(sig, expected)) return null;
  return { email: e };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function siteBase(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function htmlPage({ title, body, ok = true }) {
  const accent = ok ? '#059669' : '#dc2626';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | AI Glimpse</title>
  <link rel="stylesheet" href="/css/main.css">
  <style>
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 440px; padding: 2rem; background: var(--color-paper-elev, #fff); border-radius: 12px; border: 1px solid var(--color-rule, #e5e5e5); text-align: center; }
    h1 { font-family: var(--font-display, Georgia, serif); font-size: 1.35rem; margin: 0 0 0.75rem; color: ${accent}; }
    p { margin: 0 0 1rem; line-height: 1.55; color: var(--color-ink-muted, #444); }
    a { color: var(--color-accent, #ff4d2e); font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${body}</p>
    <p><a href="/">Back to AI Glimpse</a></p>
  </div>
</body>
</html>`;
}

export async function resendSend(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export async function resendAddContact(apiKey, audienceId, email) {
  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: normalizeEmail(email), unsubscribed: false })
  });
  const data = await res.json().catch(() => null);
  // 409 = already on list — treat as success
  return { ok: res.ok || res.status === 409, status: res.status, data };
}

export async function resendRemoveContact(apiKey, audienceId, email) {
  const res = await fetch(
    `https://api.resend.com/audiences/${audienceId}/contacts/${encodeURIComponent(normalizeEmail(email))}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` }
    }
  );
  return { ok: res.ok || res.status === 404, status: res.status };
}

export { UNSUB_TTL_MS };
