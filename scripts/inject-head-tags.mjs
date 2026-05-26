#!/usr/bin/env node
// Inject one or more snippets into the <head> of every existing static HTML file.
// Idempotent: each snippet has a unique marker; files already containing the
// marker are skipped.
//
// Future articles automatically get these snippets because the templates in
// fetch-and-publish.mjs, build-homepage.mjs, and build-categories.mjs each
// include them inline. This script only patches the historical files.

import fs from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(process.cwd());

// Each entry: { marker: substring uniquely identifying the snippet, snippet: HTML to insert }
const SNIPPETS = [
  {
    marker: 'adsbygoogle.js',
    snippet: '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4263484717830850" crossorigin="anonymous"></script>'
  },
  {
    marker: 'google-site-verification',
    snippet: '<meta name="google-site-verification" content="B132aMlqf1nssWYhjOSKUgSjmfwNWgPgtozZsHDxWlU" />'
  },
  {
    marker: 'msvalidate.01',
    snippet: '<meta name="msvalidate.01" content="F3762E555B3E685836AE39C90B79ECBF" />'
  },
  {
    // Inline gtag('consent','default') so all AdSense + Analytics storage is
    // denied until the visitor accepts via the banner. Required for AdSense
    // EEA/UK consent rules and GDPR. Must run before AdSense fires its first
    // ad request, putting it inline in <head> guarantees that.
    marker: 'aiglimpse-consent-default v1',
    snippet: `<!-- aiglimpse-consent-default v1: must run before AdSense, defaults all ad/analytics storage to denied -->\n  <script>(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});try{var s=JSON.parse(localStorage.getItem('aiglimpse-consent')||'null');if(s&&s.choice==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}}catch(e){}})();</script>`
  }
];

const TARGET_DIRS = ['articles', 'pages', 'categories'];
const TARGET_FILES = ['404.html', 'index.html'];

async function listHtml(dir) {
  try {
    const entries = await fs.readdir(path.join(ROOT, dir));
    return entries.filter(e => e.endsWith('.html')).map(e => path.join(dir, e));
  } catch { return []; }
}

const all = [
  ...(await Promise.all(TARGET_DIRS.map(listHtml))).flat(),
  ...TARGET_FILES
];

const stats = { touched: 0, alreadyOk: 0, inserts: 0 };

for (const rel of all) {
  const file = path.join(ROOT, rel);
  let html;
  try { html = await fs.readFile(file, 'utf8'); }
  catch { continue; }

  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) continue;

  const missing = SNIPPETS.filter(s => !html.includes(s.marker));
  if (!missing.length) { stats.alreadyOk++; continue; }

  const insertion = missing.map(s => '  ' + s.snippet).join('\n') + '\n';
  html = html.slice(0, headEnd) + insertion + html.slice(headEnd);

  await fs.writeFile(file, html);
  stats.touched++;
  stats.inserts += missing.length;
  console.log(`  + ${rel}  (${missing.map(m => m.marker).join(', ')})`);
}

console.log(`\nPatched ${stats.touched} file(s), ${stats.inserts} snippet insertion(s); ${stats.alreadyOk} already had everything.`);
