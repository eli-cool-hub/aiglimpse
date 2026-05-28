#!/usr/bin/env node
// Grant the aiglimpse-agent service account Viewer access to the GA4
// property by calling the Analytics Admin API. This bypasses the GA4 UI
// which rejects service-account emails with "This email doesn't match a
// Google Account".
//
// HOW TO RUN LOCALLY (one time):
//
//   1. Make sure gcloud CLI is installed:
//        brew install --cask google-cloud-sdk
//
//   2. Authenticate as yourself with Analytics edit scope:
//        gcloud auth application-default login \
//          --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/analytics.readonly
//
//      (this opens a browser window, you sign in with the Google account
//       that owns the GA4 property)
//
//   3. Run this script:
//        node scripts/ga4-grant-sa-access.mjs
//
//      It will list all GA4 properties you have access to, find the one
//      tied to aiglimpse.ai, and add the service account as a Viewer.
//
// You only need to do this once. After it succeeds, all future GA4
// reporting workflows in CI will authenticate as the service account
// directly, no human OAuth required.

import { GoogleAuth } from 'google-auth-library';

const SA_EMAIL = 'aiglimpse-agent@aiglimpse.iam.gserviceaccount.com';
const ROLES = ['predefinedRoles/viewer'];

const auth = new GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/analytics.manage.users',
    'https://www.googleapis.com/auth/analytics.readonly'
  ]
});

let client;
try {
  client = await auth.getClient();
} catch (e) {
  console.error('No Application Default Credentials found.');
  console.error('Run this first, then retry:');
  console.error('  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/analytics.readonly');
  process.exit(1);
}

const tokenRes = await client.getAccessToken();
const token = typeof tokenRes === 'string' ? tokenRes : tokenRes.token;

async function ga(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

console.log('Listing GA4 properties you have access to...\n');
const summaries = await ga('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
if (summaries.status !== 200) {
  console.error('Failed:', summaries.status, JSON.stringify(summaries.body, null, 2));
  process.exit(1);
}

const accounts = summaries.body?.accountSummaries || [];
if (accounts.length === 0) {
  console.error('You have no GA4 accounts. Sign in with the right Google account, then retry.');
  process.exit(1);
}

const properties = [];
for (const a of accounts) {
  for (const p of (a.propertySummaries || [])) {
    properties.push({ account: a.displayName, property: p.property, name: p.displayName });
  }
}
for (const [i, p] of properties.entries()) {
  console.log(`  [${i}] ${p.property}  (${p.name})  account=${p.account}`);
}

const match = properties.find(p =>
  /aiglimpse/i.test(p.name) || /ai\s*glimpse/i.test(p.name)
);
const target = match || properties[0];
if (!match) {
  console.log(`\nNo "AI Glimpse" match found by name. Defaulting to first property: ${target.property} (${target.name}).`);
  console.log('If this is wrong, edit the script and hardcode the target property path.');
} else {
  console.log(`\nMatched property: ${target.property} (${target.name})`);
}

console.log('\nChecking existing access bindings...');
const existing = await ga(`https://analyticsadmin.googleapis.com/v1beta/${target.property}/accessBindings`);
if (existing.status === 200) {
  const already = (existing.body?.accessBindings || []).find(b => b.user === SA_EMAIL);
  if (already) {
    console.log(`Service account is already bound on this property with roles: ${already.roles.join(', ')}`);
    console.log('Nothing to do.');
    process.exit(0);
  }
}

console.log(`\nAdding ${SA_EMAIL} with roles ${ROLES.join(', ')} to ${target.property}...`);
// The accessBindings.create method only exists in v1alpha. v1beta lists
// bindings but returns HTML 404 on create. See:
// https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create
const create = await ga(
  `https://analyticsadmin.googleapis.com/v1alpha/${target.property}/accessBindings`,
  {
    method: 'POST',
    body: JSON.stringify({ user: SA_EMAIL, roles: ROLES })
  }
);
console.log('Status:', create.status);
console.log('Body:', JSON.stringify(create.body, null, 2));

if (create.status === 200 || create.status === 201) {
  console.log('\nSuccess. Trigger the Google APIs probe workflow to confirm.');
} else {
  console.error('\nFailed. Most common cause: the signed-in user is not a property admin.');
  console.error('Open analytics.google.com -> Admin -> Property -> Property access management and confirm your role is Admin.');
  process.exit(1);
}
