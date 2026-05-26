// Cross-source deduplication
// Same story often appears on multiple sources within minutes — we keep only the highest-tier (most authoritative) version.

import crypto from 'crypto';

// Normalize a title for fuzzy matching: lowercase, strip punctuation, keep word stems
function normalizeTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/['"'']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|as|is|are|was|were|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|can)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Jaccard similarity on word sets (0–1, higher = more similar)
function similarity(a, b) {
  const setA = new Set(a.split(' ').filter(w => w.length > 2));
  const setB = new Set(b.split(' ').filter(w => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export function deduplicate(items, similarityThreshold = 0.55) {
  // Sort by tier (lower tier number = higher authority) then by date (newer first)
  const sorted = [...items].sort((a, b) => {
    const tierDiff = (a.source.tier || 99) - (b.source.tier || 99);
    if (tierDiff !== 0) return tierDiff;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });

  const kept = [];
  const seenUrls = new Set();
  const normTitles = [];

  for (const item of sorted) {
    // Exact URL dedupe
    const urlKey = item.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    if (seenUrls.has(urlKey)) continue;

    // Fuzzy title dedupe
    const norm = normalizeTitle(item.title);
    if (norm.length < 10) continue; // skip super-short titles

    const isDup = normTitles.some(existing => similarity(norm, existing) > similarityThreshold);
    if (isDup) continue;

    seenUrls.add(urlKey);
    normTitles.push(norm);
    kept.push(item);
  }

  console.log(`  ✓ Deduped: ${items.length} → ${kept.length}`);
  return kept;
}

// Content-hash for the permanent published-index (so we never republish the same story across runs)
export function contentHash(item) {
  const normalized = normalizeTitle(item.title);
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
