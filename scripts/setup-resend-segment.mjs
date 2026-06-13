#!/usr/bin/env node
/**
 * List Resend segments (replaces deprecated audiences).
 * Usage: RESEND_API_KEY=re_xxx node scripts/setup-resend-segment.mjs
 */

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('RESEND_API_KEY required');
  process.exit(1);
}

const res = await fetch('https://api.resend.com/segments', {
  headers: { Authorization: `Bearer ${apiKey}` }
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Failed:', data.message || data.error || res.status);
  process.exit(1);
}

const segments = data.data || [];
if (!segments.length) {
  console.log('No segments yet. In Resend: Audience → Segments → + Create segment → "AI Glimpse Daily"');
  process.exit(0);
}

console.log('Resend segments:\n');
for (const s of segments) {
  console.log(`  ${s.name}`);
  console.log(`    RESEND_SEGMENT_ID=${s.id}\n`);
}

const match = segments.find(s => /ai glimpse daily/i.test(s.name));
if (match) {
  console.log('Use this for Cloudflare + GitHub:');
  console.log(`RESEND_SEGMENT_ID=${match.id}`);
}
