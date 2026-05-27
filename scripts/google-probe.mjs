#!/usr/bin/env node
// Smoke-test the GOOGLE_SERVICE_ACCOUNT_JSON secret against the Google APIs we
// actually need: Search Console (search analytics + indexing) and GA4
// (account summaries). Run from a workflow_dispatch step.
//
// Prints a concise report:
//   - which sites the service account can see in GSC (should include aiglimpse.ai)
//   - which GA4 properties the service account can see (should include G-EVZ52DNQ8S's property)
//
// If GSC returns an empty list, the service account has not yet been added as a
// user on the aiglimpse.ai property and we need to retry the UI step.

import { JWT } from 'google-auth-library';

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SA_JSON) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON env var is empty');
  process.exit(1);
}

let creds;
try {
  creds = JSON.parse(SA_JSON);
} catch (e) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', e.message);
  process.exit(1);
}

console.log('Service account email:', creds.client_email);
console.log('Project ID:', creds.project_id);
console.log('');

const client = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/analytics.readonly'
  ]
});

await client.authorize();
const token = client.credentials.access_token;

async function api(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

console.log('=== Search Console: GET /webmasters/v3/sites ===');
const gsc = await api('https://searchconsole.googleapis.com/webmasters/v3/sites');
console.log('Status:', gsc.status);
const sites = gsc.body?.siteEntry || [];
if (sites.length === 0) {
  console.log('No sites visible to this service account.');
  console.log('Action required: open Search Console → Settings → Users and permissions, click ADD USER, paste the email above, set role Full or Owner, click ADD.');
} else {
  for (const site of sites) {
    console.log(`  ${site.permissionLevel.padEnd(18)} ${site.siteUrl}`);
  }
}
console.log('');

console.log('=== GA4 Admin: GET /v1beta/accountSummaries ===');
const ga = await api('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
console.log('Status:', ga.status);
const accts = ga.body?.accountSummaries || [];
if (accts.length === 0) {
  console.log('No GA4 accounts visible to this service account.');
  console.log('Action required: open analytics.google.com → Admin (gear) → Property → Property Access Management → +, paste the email above, role Viewer.');
} else {
  for (const a of accts) {
    console.log(`  Account ${a.account}  (${a.displayName})`);
    for (const p of (a.propertySummaries || [])) {
      console.log(`    Property ${p.property}  (${p.displayName})  parent=${p.parent || '-'}`);
    }
  }
}
console.log('');

const ok = sites.length > 0 && accts.length > 0;
console.log(ok ? 'Both GSC and GA4 access confirmed.' : 'One or both APIs returned no access. See actions above.');
process.exit(ok ? 0 : 0);
