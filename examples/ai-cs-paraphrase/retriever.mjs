/**
 * Two retrievers over the same documents:
 *
 *   retrieveNaive  — literal keyword matcher (the thing that fails when the
 *                    user rephrases the same question).
 *   retrieveRobust — normalize the query first: synonyms → canonical terms,
 *                    time/action words → intents, then score documents.
 *
 * No model is involved in either path. The model can be DeepSeek V4 Flash,
 * GPT, or anything else; if the retrieval layer only does literal matching,
 * a paraphrase will still miss.
 */
import { DOCS } from './knowledge.mjs';

/** Literal matching: at least two exact keywords must appear. */
export function retrieveNaive(query) {
  const q = String(query || '');
  let best = null;
  let bestScore = 0;
  for (const doc of DOCS) {
    const score = doc.keywords.filter((k) => q.includes(k)).length;
    if (score > bestScore) {
      best = doc;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

const RULES = [
  [/种完牙|种了牙|种的牙|种一颗牙|种牙|种植牙/g, '种植牙'],
  [/漱口/g, '漱口'],
  [/刷牙|清洁|刷一刷|刷/g, '刷牙'],
  [/脸肿|肿起来|肿/g, '肿胀'],
  [/冰敷|冷敷/g, '冰敷'],
  [/吃饭|饮食|吃东西|吃火锅|喝热水|喝汤/g, '饮食'],
  [/术后|手术后|做完|刚做完|昨天|今天/g, '术后'],
  [/多久|什么时候|几天|多长时间/g, '时间'],
];

/**
 * Turn a paraphrase into a stable canonical form.
 * Real systems should keep this list in a data file and review it; the point
 * is that it is deterministic and testable, not a prompt.
 */
export function canonicalize(query) {
  let s = String(query || '').toLowerCase().replace(/\s+/g, '');
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s;
}

/** Normalized matching: score canonical terms, return the best document. */
export function retrieveRobust(query) {
  const q = canonicalize(query);
  let best = null;
  let bestScore = 0;
  for (const doc of DOCS) {
    const score = doc.keywords.filter((k) => q.includes(k)).length;
    if (score > bestScore) {
      best = doc;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}
