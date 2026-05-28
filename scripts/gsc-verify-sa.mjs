#!/usr/bin/env node
// Grant the service account ownership of https://aiglimpse.ai/ in Google
// Search Console by going through the Site Verification API.
//
// Why this script exists: Google Search Console's "Add user" UI runs a
// directory lookup that rejects service-account emails ending in
// .iam.gserviceaccount.com because they are not registered as consumer
// Google identities. The documented workaround is the Site Verification
// API, which accepts the service account's own token and registers it as
// a verified owner once a DNS TXT record proves control of the domain.
//
// Steps performed end to end:
//   1. Ask Site Verification for a DNS TXT token for https://aiglimpse.ai/
//   2. PUT that TXT record on the aiglimpse.ai zone via the Cloudflare API
//   3. Wait for DNS to propagate (Google checks via 8.8.8.8 / 8.8.4.4)
//   4. Call siteVerification.webResource.insert to claim ownership
//   5. Re-run the GSC sites list to confirm aiglimpse.ai is now visible
//
// Required:
//   - GOOGLE_SERVICE_ACCOUNT_JSON (with Site Verification API enabled in the
//     parent GCP project)
//   - CLOUDFLARE_API_TOKEN with Zone:DNS:Edit on aiglimpse.ai
//
// Required Google API to be enabled:
//   https://console.cloud.google.com/apis/library/siteverification.googleapis.com

import { JWT } from 'google-auth-library';
import dns from 'node:dns/promises';

const SITE = 'https://aiglimpse.ai/';
const ZONE_NAME = 'aiglimpse.ai';
const TXT_RECORD_NAME = ZONE_NAME;
const CF_API = 'https://api.cloudflare.com/client/v4';

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!CF_TOKEN) { console.error('CLOUDFLARE_API_TOKEN missing'); process.exit(1); }
if (!SA_JSON) { console.error('GOOGLE_SERVICE_ACCOUNT_JSON missing'); process.exit(1); }

const creds = JSON.parse(SA_JSON);
console.log('Service account:', creds.client_email);

const jwt = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: [
    'https://www.googleapis.com/auth/siteverification',
    'https://www.googleapis.com/auth/webmasters'
  ]
});
await jwt.authorize();
const googleToken = jwt.credentials.access_token;

async function googleFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${googleToken}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function cfFetch(url, opts = {}) {
  const res = await fetch(`${CF_API}${url}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

console.log('\n--- Step 1: request DNS TXT verification token from Google ---');
const tokenRes = await googleFetch(
  'https://www.googleapis.com/siteVerification/v1/token',
  {
    method: 'POST',
    body: JSON.stringify({
      site: { type: 'INET_DOMAIN', identifier: ZONE_NAME },
      verificationMethod: 'DNS_TXT'
    })
  }
);
console.log('Status:', tokenRes.status);
console.log('Body:', JSON.stringify(tokenRes.body, null, 2));
if (tokenRes.status !== 200) {
  console.error('Site Verification API did not return a token. Enable it at https://console.cloud.google.com/apis/library/siteverification.googleapis.com');
  process.exit(1);
}
const txtValue = tokenRes.body.token;
console.log('TXT value to install:', txtValue);

console.log('\n--- Step 2: install TXT record on Cloudflare DNS ---');
const zoneRes = await cfFetch(`/zones?name=${ZONE_NAME}`);
const zoneId = zoneRes.body?.result?.[0]?.id;
if (!zoneId) {
  console.error('Could not resolve Cloudflare zone for', ZONE_NAME);
  console.error(JSON.stringify(zoneRes.body, null, 2));
  process.exit(1);
}
console.log('Cloudflare zone id:', zoneId);

const existingRes = await cfFetch(
  `/zones/${zoneId}/dns_records?type=TXT&name=${TXT_RECORD_NAME}`
);
const existing = (existingRes.body?.result || []).find(r => r.content === txtValue || r.content === `"${txtValue}"`);
if (existing) {
  console.log('TXT record already present, skipping create.');
} else {
  const create = await cfFetch(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'TXT',
      name: TXT_RECORD_NAME,
      content: txtValue,
      ttl: 120,
      comment: 'Site Verification token for aiglimpse-agent service account'
    })
  });
  console.log('Create status:', create.status);
  console.log('Create body:', JSON.stringify(create.body, null, 2));
  if (!create.body?.success) {
    console.error('Failed to create TXT record on Cloudflare');
    process.exit(1);
  }
}

console.log('\n--- Step 3: wait for DNS to propagate ---');
let propagated = false;
for (let i = 0; i < 24; i++) {
  try {
    const records = await dns.resolveTxt(ZONE_NAME);
    const flat = records.flat();
    console.log(`  attempt ${i + 1}: found ${flat.length} TXT record(s)`);
    if (flat.some(r => r.includes(txtValue))) {
      propagated = true;
      console.log('  TXT visible to public resolver');
      break;
    }
  } catch (e) {
    console.log(`  attempt ${i + 1}: ${e.code || e.message}`);
  }
  await new Promise(r => setTimeout(r, 5000));
}
if (!propagated) {
  console.warn('TXT did not appear in 2 minutes; Google may still see it. Continuing.');
}

console.log('\n--- Step 4: ask Google to verify ownership ---');
const insertRes = await googleFetch(
  'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT',
  {
    method: 'POST',
    body: JSON.stringify({
      site: { type: 'INET_DOMAIN', identifier: ZONE_NAME }
    })
  }
);
console.log('Status:', insertRes.status);
console.log('Body:', JSON.stringify(insertRes.body, null, 2));
if (insertRes.status !== 200) {
  console.error('Verification failed. The service account is NOT an owner yet.');
  console.error('If the error is "Token not found", wait a minute and re-run the workflow.');
  process.exit(1);
}

console.log('\n--- Step 5: register the site in the SA\'s Search Console account ---');
// Site Verification proves ownership but the SA also needs to "claim" the
// site in its own Search Console account by calling sites.add. This is a
// no-op idempotent PUT when the site is already in the account.
for (const target of ['https://aiglimpse.ai/', 'sc-domain:aiglimpse.ai']) {
  const encoded = encodeURIComponent(target);
  const add = await googleFetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}`,
    { method: 'PUT' }
  );
  console.log(`  PUT ${target}  ->  ${add.status}  ${JSON.stringify(add.body)}`);
}

console.log('\n--- Step 6: confirm by listing GSC sites the SA can see ---');
const sitesRes = await googleFetch('https://searchconsole.googleapis.com/webmasters/v3/sites');
console.log('Status:', sitesRes.status);
const entries = sitesRes.body?.siteEntry || [];
if (entries.length === 0) {
  console.warn('Sites list still empty. Google may need a few minutes to propagate ownership. Re-run probe workflow in 2 minutes.');
} else {
  for (const e of entries) {
    console.log(`  ${e.permissionLevel.padEnd(18)} ${e.siteUrl}`);
  }
}

console.log('\nDone. Service account is now verified for', ZONE_NAME);
