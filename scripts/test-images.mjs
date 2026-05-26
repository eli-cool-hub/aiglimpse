#!/usr/bin/env node
// Manual smoke test for the article image generator.
//
// Usage:
//   node scripts/test-images.mjs           , normal run (tries Pollinations then SVG)
//   FORCE_SVG=1 node scripts/test-images.mjs, force SVG fallback only

import fs from 'fs/promises';
import path from 'path';

if (process.env.FORCE_SVG === '1') {
  // Monkey-patch fetch to immediately fail so we exercise the SVG fallback.
  global.fetch = () => Promise.reject(new Error('forced fallback (test)'));
}

const { generateArticleImage } = await import('./lib/images.mjs');

const prefix = process.env.FORCE_SVG === '1' ? 'svgfb' : 'test';
const cases = [
  { slug: `${prefix}-llms-gpt6-launch`, title: 'OpenAI launches GPT-6 with 10M context window', category: 'llms' },
  { slug: `${prefix}-research-physics-3d`, title: 'New AI method turns 3D scene images into physics-ready models', category: 'research' },
  { slug: `${prefix}-tools-cursor-3`, title: 'Cursor 3.0 ships with multi-agent debugging', category: 'tools' },
  { slug: `${prefix}-business-anthropic-round`, title: 'Anthropic closes $40B round at $300B valuation', category: 'business' },
  { slug: `${prefix}-ethics-eu-act`, title: 'EU AI Act enforcement begins for foundation models', category: 'ethics' },
  { slug: `${prefix}-industry-tsmc`, title: 'TSMC unveils 1.4nm process for next-gen AI accelerators', category: 'industry' },
  { slug: `${prefix}-robotics-figure`, title: 'Figure 03 humanoid demonstrates full home-task autonomy', category: 'robotics' }
];

await fs.mkdir(path.resolve('images', 'articles'), { recursive: true });

console.log(`\nRunning ${cases.length} image generation tests...\n`);
for (const c of cases) {
  const out = await generateArticleImage(c.slug, c.title, c.category);
  console.log(`  [${c.category.padEnd(8)}] ${out}`);
}
console.log('\nDone. Open the images/articles/test-*.* files to inspect.\n');
