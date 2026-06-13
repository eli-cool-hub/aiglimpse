#!/usr/bin/env node
/**
 * One-time helper: create a Resend Audience for AI Glimpse subscribers.
 * Prints RESEND_AUDIENCE_ID for Cloudflare Pages + GitHub secrets.
 *
 * Usage: RESEND_API_KEY=re_xxx node scripts/setup-resend-audience.mjs
 */

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('RESEND_API_KEY required');
  process.exit(1);
}

const res = await fetch('https://api.resend.com/audiences', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'AI Glimpse Daily' })
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Failed:', data.message || data.error || res.status);
  process.exit(1);
}

console.log('✓ Created Resend audience: AI Glimpse Daily');
console.log(`  RESEND_AUDIENCE_ID=${data.id}`);
console.log('\nAdd to Cloudflare Pages → aiglimpse → Settings → Environment variables');
console.log('Add to GitHub repo secrets for the newsletter-daily workflow.');
