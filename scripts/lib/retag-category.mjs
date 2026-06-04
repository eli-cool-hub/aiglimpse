// Retag published articles to a different category (HTML + published.json).

import fs from 'fs/promises';
import path from 'path';

const ARTICLES_DIR = path.join(process.cwd(), 'articles');

const CAT = {
  llms: { path: 'llms', label: 'LLMs & Chatbots', tagClass: 'tag--llm', section: 'LLMs & Chatbots' },
  research: { path: 'research', label: 'AI Research', tagClass: 'tag--research', section: 'AI Research' },
  tools: { path: 'tools', label: 'AI Tools & Products', tagClass: 'tag--tools', section: 'AI Tools & Products' },
  business: { path: 'business', label: 'AI Business', tagClass: 'tag--business', section: 'AI Business' },
  ethics: { path: 'ethics', label: 'Ethics & Policy', tagClass: 'tag--ethics', section: 'Ethics & Policy' },
  industry: { path: 'industry', label: 'Industry Applications', tagClass: 'tag--industry', section: 'Industry Applications' },
  robotics: { path: 'robotics', label: 'Robotics', tagClass: 'tag--robotics', section: 'Robotics' }
};

export async function retagArticle(slug, newCategory, published) {
  const from = published.articles.find(a => a.slug === slug);
  if (!from) throw new Error(`Article not found: ${slug}`);
  const oldCat = from.category;
  if (oldCat === newCategory) return { changed: false, slug, category: newCategory };

  const oldMeta = CAT[oldCat];
  const newMeta = CAT[newCategory];
  if (!newMeta) throw new Error(`Unknown category: ${newCategory}`);

  const filePath = path.join(ARTICLES_DIR, `${slug}.html`);
  let html = await fs.readFile(filePath, 'utf8');

  if (oldMeta) {
    html = html.replaceAll(`/categories/${oldMeta.path}`, `/categories/${newMeta.path}`);
    html = html.replaceAll(oldMeta.label, newMeta.label);
    html = html.replace(/<span class="tag tag--[a-z]+">/g, `<span class="tag ${newMeta.tagClass}">`);
    html = html.replaceAll(`article:section" content="${oldMeta.section}"`, `article:section" content="${newMeta.section}"`);
    html = html.replaceAll(`"articleSection":"${oldMeta.section}"`, `"articleSection":"${newMeta.section}"`);
  }

  await fs.writeFile(filePath, html);
  from.category = newCategory;
  return { changed: true, slug, from: oldCat, to: newCategory };
}
