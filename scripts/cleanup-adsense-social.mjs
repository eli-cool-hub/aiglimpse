#!/usr/bin/env node
// One-shot cleanup: remove AdSense + dead X/LinkedIn footer icons, fix /guides links,
// refresh baked footer from scripts/lib/chrome.mjs, strip false sameAs claims.
//
// Run after template changes: node scripts/cleanup-adsense-social.mjs

import fs from 'fs/promises';
import path from 'path';
import { footerHtml } from './lib/chrome.mjs';

const ROOT = path.resolve(process.cwd());

const ADSENSE_RE = /\s*<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"]*"[^>]*><\/script>\s*/g;
const SOCIAL_ICONS_RE = /\s*<a href="#" aria-label="X \(Twitter\)">[\s\S]*?<\/a>\s*<a href="#" aria-label="LinkedIn">[\s\S]*?<\/a>\s*/g;
const SAMEAS_RE = /"sameAs"\s*:\s*\[[^\]]*\]/g;
const GUIDES_HREF_RE = /href="\/guides\.html"/g;
const GUIDES_CANON_RE = /https:\/\/aiglimpse\.ai\/guides\.html/g;
const CONSENT_ADS_RE = /We use cookies to deliver relevant ads via Google AdSense and to understand how readers use AI Glimpse\./g;

async function walkHtml(dir) {
  const out = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules', '.git', 'reports', 'scripts'].includes(e.name)) {
      out.push(...await walkHtml(p));
    } else if (e.isFile() && e.name.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  const files = [
    ...(await walkHtml(ROOT)).filter(f => !f.includes(`${path.sep}node_modules${path.sep}`)),
  ];
  // Prefer unique paths
  const uniq = [...new Set(files)];
  let touched = 0;
  const newFooter = footerHtml();

  for (const file of uniq) {
    let html = await fs.readFile(file, 'utf8');
    const before = html;

    html = html.replace(ADSENSE_RE, '\n');
    html = html.replace(SOCIAL_ICONS_RE, '\n');
    html = html.replace(SAMEAS_RE, '"sameAs": []');
    html = html.replace(GUIDES_HREF_RE, 'href="/guides"');
    html = html.replace(GUIDES_CANON_RE, 'https://aiglimpse.ai/guides');
    html = html.replace(CONSENT_ADS_RE, 'We use cookies to understand how readers use AI Glimpse (Google Analytics).');

    // Replace entire baked footer if present (keeps chrome in sync).
    if (html.includes('class="site-footer"') && html.includes('footer-social')) {
      html = html.replace(/<footer class="site-footer"[\s\S]*?<\/footer>/, newFooter);
    }

    if (html !== before) {
      await fs.writeFile(file, html);
      touched++;
    }
  }
  console.log(`✓ cleaned ${touched}/${uniq.length} HTML files (AdSense, social icons, /guides, footer)`);
}

main().catch(e => { console.error(e); process.exit(1); });
