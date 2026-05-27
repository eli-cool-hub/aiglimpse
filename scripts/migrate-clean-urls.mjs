// One-shot: rewrite .html URL references inside already-published static
// pages so they match the clean URLs that Cloudflare Pages serves at.
// Touches canonical, og:url, JSON-LD @id, in-page <a href> internal links,
// and the bare category-page URL self-references.
//
// File paths on disk stay *.html because that is what Cloudflare needs to
// resolve the clean URL. Only URL *references* are rewritten.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));

// Anything inside href="..." or content="..." or "url":"..." (JSON-LD)
// or <loc>...</loc> (sitemap) that ends in articles/<slug>.html,
// categories/<slug>.html, or pages/<slug>.html gets the .html dropped.
// We are deliberately surgical: only inside quote/tag boundaries, so file
// paths in <script> code and the like are not touched.
const PATTERNS = [
  // href="/articles/foo.html" or href="https://aiglimpse.ai/articles/foo.html"
  { re: /(href=["'])((?:https?:\/\/[^"']+)?\/(?:articles|categories|pages)\/[^"'\s]+)\.html(["'])/g,
    fix: (_, p1, p2, p3) => `${p1}${p2}${p3}` },
  // content="/articles/foo.html" (og:url et al)
  { re: /(content=["'])((?:https?:\/\/[^"']+)?\/(?:articles|categories|pages)\/[^"'\s]+)\.html(["'])/g,
    fix: (_, p1, p2, p3) => `${p1}${p2}${p3}` },
  // "url":"https://.../articles/foo.html" or "@id":"..."  (JSON-LD)
  { re: /("(?:url|@id)"\s*:\s*")((?:https?:\/\/[^"]+)?\/(?:articles|categories|pages)\/[^"\s]+)\.html(")/g,
    fix: (_, p1, p2, p3) => `${p1}${p2}${p3}` },
  // <loc>https://.../articles/foo.html</loc>
  { re: /(<loc>)((?:https?:\/\/[^<\s]+)?\/(?:articles|categories|pages)\/[^<\s]+)\.html(<\/loc>)/g,
    fix: (_, p1, p2, p3) => `${p1}${p2}${p3}` },
  // <link>https://.../articles/foo.html</link>  (rss item)
  { re: /(<link>)((?:https?:\/\/[^<\s]+)?\/(?:articles|categories|pages)\/[^<\s]+)\.html(<\/link>)/g,
    fix: (_, p1, p2, p3) => `${p1}${p2}${p3}` },
  // <guid ...>https://.../articles/foo.html</guid>
  { re: /(<guid[^>]*>)((?:https?:\/\/[^<\s]+)?\/(?:articles|categories|pages)\/[^<\s]+)\.html(<\/guid>)/g,
    fix: (_, p1, p2, p3) => `${p1}${p2}${p3}` }
];

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Don't recurse into hidden, node_modules, or images/
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'images') continue;
      out.push(...await walk(p));
    } else if (/\.(html|xml)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const TARGETS = await walk(ROOT);
let changedFiles = 0;
let totalSubs = 0;

for (const file of TARGETS) {
  const before = await fs.readFile(file, 'utf8');
  let after = before;
  let subs = 0;
  for (const { re, fix } of PATTERNS) {
    after = after.replace(re, (...args) => { subs++; return fix(...args); });
  }
  if (after !== before) {
    await fs.writeFile(file, after);
    changedFiles++;
    totalSubs += subs;
    console.log(`  ✓ ${path.relative(ROOT, file)}  (${subs} subs)`);
  }
}

console.log(`\nDone: ${changedFiles} files updated, ${totalSubs} URL refs cleaned.`);
