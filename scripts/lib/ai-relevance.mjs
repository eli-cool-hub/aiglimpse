// Decide whether an incoming story belongs on an AI news site.
// Uses word-boundary matching so "training" / "rain" do not false-match "AI".

const STRONG_TERMS = [
  'artificial intelligence',
  'machine learning',
  'deep learning',
  'neural network',
  'neural networks',
  'large language model',
  'language model',
  'language models',
  'generative ai',
  'gen ai',
  'foundation model',
  'foundation models',
  'ai agent',
  'ai agents',
  'agentic ai',
  'openai',
  'anthropic',
  'chatgpt',
  'gpt-4',
  'gpt-5',
  'gpt-3',
  'claude',
  'gemini',
  'llama',
  'mistral',
  'deepseek',
  'copilot',
  'midjourney',
  'stable diffusion',
  'hugging face',
  'deepmind',
  'nvidia',
  'transformer',
  'diffusion model',
  'rag',
  'fine-tuning',
  'fine tuning',
  'prompt engineering',
  'computer vision',
  'reinforcement learning',
  'arxiv',
  'benchmark',
  'llm',
  'llms',
  'ml model',
  'ai model',
  'ai models',
  'ai startup',
  'ai tool',
  'ai tools',
  'robotics',
  'humanoid robot',
  'self-driving',
  'autonomous vehicle',
  'semiconductor',
  'gpu',
  'cuda',
  'inference',
  'training data',
  'model weights',
  'open source model',
  'ai safety',
  'ai regulation',
  'ai ethics',
  'ai research',
  'ai chip',
  'ai chips'
];

const WEAK_TERMS = [' ai ', ' ai,', ' ai.', ' ai:', ' ai)', '(ai'];

const NON_AI_BLOCKLIST = [
  'pancreatic cancer',
  'prostate cancer',
  'breast cancer',
  'lung cancer',
  'clinical trial',
  'oncology trial',
  'daily pill',
  'oral medication',
  'municipal election',
  'transit project',
  'housing policy',
  'weather forecast',
  'sports score',
  'recipe for',
  'celebrity wedding'
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termRegex(term) {
  if (term.length <= 3) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(term)}(?:$|[^a-z0-9])`, 'i');
  }
  return new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
}

export function textMatchesAiTerm(text) {
  const blob = ` ${String(text || '').toLowerCase()} `;
  if (STRONG_TERMS.some(t => termRegex(t).test(blob))) return true;
  return WEAK_TERMS.some(t => blob.includes(t));
}

export function isTrustedAiSource(item) {
  const name = String(item?.source?.title || '').toLowerCase();
  if (name.startsWith('arxiv')) return true;
  if (name.startsWith('github')) return true;
  if (item?.source?.tier === 1) return true;
  const trusted = [
    'openai', 'deepmind', 'google ai', 'microsoft ai', 'hugging face',
    'mit technology review', 'venturebeat', 'the verge', 'techcrunch',
    'ars technica', 'wired', 'ieee spectrum', 'import ai', 'the gradient',
    'interconnects', 'one useful thing', 'ai snake oil', 'robohub'
  ];
  return trusted.some(t => name.includes(t));
}

export function aiRelevanceScore(item) {
  const blob = `${item?.title || ''} ${item?.summary || ''} ${item?.body || ''}`.toLowerCase();
  let score = 0;

  for (const term of STRONG_TERMS) {
    if (termRegex(term).test(blob)) score += term.includes(' ') ? 4 : 3;
  }
  if (/\bai\b/.test(blob)) score += 1;

  for (const bad of NON_AI_BLOCKLIST) {
    if (blob.includes(bad) && score < 4) score -= 5;
  }

  return score;
}

export function isAiRelevant(item, { minScore = 2 } = {}) {
  if (isTrustedAiSource(item)) return true;
  if (textMatchesAiTerm(`${item?.title || ''} ${item?.summary || ''}`)) return true;
  return aiRelevanceScore(item) >= minScore;
}

/** HN / broad feeds: require a real AI signal in title or summary (not body comments). */
export function isAiRelevantForCommunity(item) {
  const lead = `${item?.title || ''} ${item?.summary || ''}`;
  return textMatchesAiTerm(lead) && aiRelevanceScore({ ...item, body: '' }) >= 2;
}

export const HN_AI_TERMS = STRONG_TERMS;
