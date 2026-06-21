#!/usr/bin/env node
/**
 * Build llms.txt and llms-full.txt from data/published.json for AI crawler discovery.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.cwd();
const SITE = 'https://aiglimpse.ai';
const PUBLISHED_PATH = path.join(ROOT, 'data', 'published.json');

const CATEGORIES = [
  { slug: 'llms', name: 'LLMs and Chatbots', desc: 'Large language models, ChatGPT, Claude, Gemini, Llama, and the labs building them.' },
  { slug: 'research', name: 'AI Research', desc: 'Papers, breakthroughs, benchmarks, and long-arc trends in artificial intelligence.' },
  { slug: 'tools', name: 'AI Tools and Products', desc: 'Launches, releases, and coverage of AI tools developers and creators use.' },
  { slug: 'business', name: 'AI Business', desc: 'Funding rounds, acquisitions, market moves, and the business of AI.' },
  { slug: 'ethics', name: 'Ethics and Policy', desc: 'Regulation, safety, governance, lawsuits, and social impact of AI.' },
  { slug: 'industry', name: 'Industry Applications', desc: 'AI deployed in healthcare, finance, manufacturing, and enterprise.' },
  { slug: 'robotics', name: 'Robotics', desc: 'Humanoids, autonomous systems, and the convergence of AI with physical machines.' }
];

function fmtDate(iso) {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function articleLine(a) {
  const date = fmtDate(a.publishedAt);
  const sub = a.subtitle ? `: ${a.subtitle}` : '';
  return `- [${a.title}](${SITE}/articles/${a.slug}) (${date})${sub}`;
}

function articleBlock(a) {
  const lines = [
    `### ${a.title}`,
    `- URL: ${SITE}/articles/${a.slug}`,
    `- Published: ${fmtDate(a.publishedAt)}`,
    `- Category: ${a.category || 'tools'}`
  ];
  if (a.subtitle) lines.push(`- Summary: ${a.subtitle}`);
  if (a.sourceUrl) lines.push(`- Source: ${a.sourceUrl}`);
  if (a.evergreen) lines.push('- Type: evergreen explainer (FAQ schema on page)');
  return lines.join('\n');
}

export async function buildLlmsTxt() {
  const data = JSON.parse(await fs.readFile(PUBLISHED_PATH, 'utf8'));
  const articles = data.articles || [];
  const evergreens = articles.filter(a => a.evergreen);
  const recent = articles.slice(0, 30);

  const llms = `# AI Glimpse

> Independent AI news, research, and analysis. Daily reporting on LLMs, AI tools, business, ethics, and the future of artificial intelligence.

AI Glimpse aggregates and rewrites stories from authoritative AI sources: frontier labs (OpenAI, Google DeepMind, Microsoft), top publications (MIT Technology Review, The Verge, TechCrunch, Wired, Ars Technica, IEEE Spectrum), Crunchbase News, and specialist analysis (Interconnects, Stratechery, One Useful Thing). Coverage updates every two hours, seven days a week.

All content is original reporting by the AI Glimpse newsroom. Primary sources are linked in each article. Content is free to reference, quote, and cite with attribution to AI Glimpse and a link to the article URL.

## Sections

- [Latest news](${SITE}/): Homepage with the most recent stories across all categories.
${CATEGORIES.map(c => `- [${c.name}](${SITE}/categories/${c.slug}): ${c.desc}`).join('\n')}
- [Explainers and guides](${SITE}/guides): Evergreen technical explainers (RAG, MCP, LLM comparison, AI agents).

## Recent articles

${recent.map(articleLine).join('\n')}

## Explainers (evergreen)

${evergreens.length ? evergreens.map(articleLine).join('\n') : '- See guides hub'}

## Feeds and machine-readable indexes

- [Sitemap](${SITE}/sitemap.xml): All article URLs with publish dates (Google News format).
- [RSS](${SITE}/rss.xml): 50 most recent articles (RSS 2.0).
- [Full content index](${SITE}/llms-full.txt): Extended article list for LLM crawlers (${articles.length} articles).

## About

- [About AI Glimpse](${SITE}/pages/about)
- [Editorial standards](${SITE}/pages/editorial)
- [Contact](${SITE}/pages/contact)
`;

  const fullSections = [
    `# AI Glimpse — full content index`,
    ``,
    `> Machine-readable index for AI assistants, answer engines, and research crawlers.`,
    `> Summary version: ${SITE}/llms.txt`,
    ``,
    `Total articles: ${articles.length} | Evergreen explainers: ${evergreens.length} | Generated: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `## Evergreen explainers`,
    ``,
    evergreens.map(articleBlock).join('\n\n'),
    ``,
    `## All articles (newest first)`,
    ``
  ];

  for (const a of articles) {
    fullSections.push(articleBlock(a));
    fullSections.push('');
  }

  await fs.writeFile(path.join(ROOT, 'llms.txt'), llms);
  await fs.writeFile(path.join(ROOT, 'llms-full.txt'), fullSections.join('\n'));
  console.log(`  ✓ llms.txt + llms-full.txt rebuilt (${articles.length} articles, ${evergreens.length} explainers)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildLlmsTxt().catch(e => { console.error(e); process.exit(1); });
}
