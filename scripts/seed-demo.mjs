#!/usr/bin/env node
/**
 * Fills data/published.json with 15 demo articles that:
 *   • Have unique slugs (so each gets a unique AI-generated hero image)
 *   • All click through to /articles/sample-1.html (the one real article we ship with)
 *   • Use direct Pollinations.ai image URLs (no local download, instant preview)
 *
 * Run:    npm run seed-demo
 * Reset:  npm run reset-data    (clears demos before going live)
 *
 * Once the real pipeline runs, it will publish real articles with locally-downloaded images.
 * Always run `npm run reset-data` before shipping to production.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { buildHomepage } from './build-homepage.mjs';
import { buildCategories } from './build-categories.mjs';

const ROOT = path.resolve(process.cwd());
const PUBLISHED_PATH = path.join(ROOT, 'data', 'published.json');

const CATEGORY_STYLE = {
  llms:     'abstract neural network with glowing data flows and interconnected nodes',
  research: 'minimalist scientific abstract concept, geometric shapes, technical diagram aesthetic',
  tools:    'modern product illustration, clean geometric composition, sleek tech aesthetic',
  business: 'abstract growth-and-finance illustration, geometric arrows and ascending lines',
  ethics:   'thoughtful philosophical illustration, scales of balance, abstract justice motif',
  industry: 'industrial automation concept, factory and machinery in abstract form',
  robotics: 'minimalist humanoid robot silhouette, futuristic mechanical concept'
};
const BASE_STYLE = 'editorial illustration, premium magazine cover, cinematic lighting, warm dark background with orange and amber highlights, minimalist composition, no text, no human faces';

function seedFromSlug(slug) {
  const hash = crypto.createHash('sha256').update(slug).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 1_000_000_000;
}

function pollinationsUrl(title, slug, category) {
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE.tools;
  const themed = title.replace(/["'""''']/g, '').replace(/[,-]/g, '-').replace(/\d+(\.\d+)?%?/g, '').replace(/\s+/g, ' ').trim();
  const prompt = `${themed}. ${style}. ${BASE_STYLE}`;
  const seed = seedFromSlug(slug);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&seed=${seed}&nologo=true&model=flux`;
}

const DEMOS = [
  { slug: 'demo-gpt5-turbo',         title: 'OpenAI ships GPT-5 Turbo, claims 40% gain on complex reasoning benchmarks', subtitle: 'The new model debuts with a 2M-token context window, improved tool use, and a sharply lower price point that puts competitive pressure on Anthropic and Google.', category: 'llms',     hoursAgo: 2 },
  { slug: 'demo-anthropic-raise',    title: 'Anthropic raises $5B at $60B valuation as enterprise demand surges',         subtitle: 'The Claude maker\'s latest round signals investor confidence in the safety-first lab\'s enterprise traction.',                                            category: 'business', hoursAgo: 4 },
  { slug: 'demo-eu-act',             title: 'EU AI Act enforcement begins for high-risk systems, what changes today',   subtitle: 'Companies operating in the EU face new obligations. Here\'s what the law actually requires.',                                                                category: 'ethics',   hoursAgo: 6 },
  { slug: 'demo-deepmind-video',     title: 'DeepMind\'s new architecture promises 10× efficiency on video understanding', subtitle: 'A paper from the lab shows dramatic gains on long-form video benchmarks without massive scaling.',                                                          category: 'research', hoursAgo: 8 },
  { slug: 'demo-cursor-1m',          title: 'Cursor hits 1M paid users as AI coding goes mainstream',                     subtitle: 'The AI-native IDE is now growing faster than VS Code did at the same stage. Here\'s what\'s driving adoption.',                                              category: 'tools',    hoursAgo: 9 },
  { slug: 'demo-figure-bmw',         title: 'Figure 03 humanoid robot enters BMW production line at scale',               subtitle: 'After 18 months of pilot programs, the partnership moves into full deployment across three plants.',                                                        category: 'robotics', hoursAgo: 10 },
  { slug: 'demo-jpmc-ai',            title: 'JPMorgan deploys internal AI to 200,000 employees, ROI surfaces',            subtitle: 'The bank says productivity gains exceed projections in the first six months of rollout.',                                                                  category: 'industry', hoursAgo: 12 },
  { slug: 'demo-metr-bench',         title: 'New benchmark shows frontier models struggle with long-horizon planning',   subtitle: 'A multi-step agent eval from METR exposes consistent failure modes across GPT, Claude, and Gemini.',                                                       category: 'research', hoursAgo: 18 },
  { slug: 'demo-llama-4',            title: 'Meta open-sources Llama 4, raising the bar for free models',                subtitle: 'The release reshapes the open-weights landscape and puts pressure on closed-model pricing.',                                                                category: 'llms',     hoursAgo: 20 },
  { slug: 'demo-nvidia-earnings',    title: 'NVIDIA earnings: data center revenue up 94% as AI capex shows no slowdown',  subtitle: 'The chipmaker\'s results dispel "AI bubble" concerns, for now.',                                                                                          category: 'business', hoursAgo: 22 },
  { slug: 'demo-lab-economics',      title: 'The real economics of running a frontier AI lab in 2026',                    subtitle: 'We map out the unit economics of OpenAI, Anthropic, and xAI based on public filings, leaked decks, and inference cost models.',                          category: 'business', hoursAgo: 24 },
  { slug: 'demo-agents-meaning',     title: 'What "agents" actually means now, beyond the demos',                       subtitle: 'The term has been stretched past usefulness. We separate marketing from what\'s actually shipping.',                                                       category: 'tools',    hoursAgo: 26 },
  { slug: 'demo-sb1047',             title: 'California\'s SB-1047 returns: what\'s different this time',                 subtitle: 'A revised AI safety bill heads back to the legislature with new carve-outs and a smaller compliance footprint.',                                          category: 'ethics',   hoursAgo: 28 },
  { slug: 'demo-perplexity-comet',   title: 'Perplexity launches Comet browser to general availability',                  subtitle: 'The answer-engine-first browser ships out of beta with deep AI integrations across every tab.',                                                            category: 'tools',    hoursAgo: 30 },
  { slug: 'demo-fda-diagnostic',     title: 'Healthcare AI hits inflection point as FDA approves 12th diagnostic model',  subtitle: 'Regulatory momentum signals broader acceptance of AI-assisted diagnosis in clinical workflows.',                                                            category: 'industry', hoursAgo: 32 }
];

function entry(d) {
  const ts = new Date(Date.now() - d.hoursAgo * 3600 * 1000).toISOString();
  return {
    slug: d.slug,
    href: '/articles/sample-1.html', // every demo links to the one real article we ship with
    title: d.title,
    subtitle: d.subtitle,
    category: d.category,
    publishedAt: ts,
    sourceUrl: 'https://example.com',
    sourceName: 'Demo source',
    sourceTier: 1,
    image: pollinationsUrl(d.title, d.slug, d.category),
    _demo: true
  };
}

async function main() {
  const articles = DEMOS.map(entry);
  await fs.mkdir(path.dirname(PUBLISHED_PATH), { recursive: true });
  await fs.writeFile(PUBLISHED_PATH, JSON.stringify({ articles, hashes: [] }, null, 2));
  console.log(`✓ Seeded data/published.json with ${articles.length} demo articles (AI-generated images via Pollinations)`);
  await buildHomepage();
  await buildCategories();
  console.log('\n  Visit http://localhost:8000/ to preview.');
  console.log('  Images stream in from Pollinations on first page load (may take 5-15s each).');
  console.log('  Run `npm run reset-data` before going live to clear demo entries.');
}

main().catch(e => { console.error(e); process.exit(1); });
