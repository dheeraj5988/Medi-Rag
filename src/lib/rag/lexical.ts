import { StoredChunk, RetrievalResult } from '../../types';

/**
 * Keyword (BM25) ranking. Works with no API key and no embeddings, so retrieval still works offline.
 * The corpus is small (hundreds of passages), so statistics are computed on the fly per call.
 */

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can do does for from had has have how i if in into is it its may more most no not of on ' +
    'or our so than that the their them then there these they this to was we were what when where which who why will with ' +
    'you your about after also any been being both each other some such through very'
  ).split(' ')
);

export function tokenize(text: string): string[] {
  const normalised = text
    .toLowerCase()
    // "hepatitis B" must stay distinct from "hepatitis A": glue the letter on as one token
    .replace(/\bhepatitis\s+([a-e])\b/g, 'hepatitis$1');
  return (normalised.match(/[a-z0-9]+/g) || [])
    .filter((t) => (t.length > 1 || /\d/.test(t)) && !STOPWORDS.has(t))
    .map(stem);
}

/** Tiny suffix stemmer (applied to queries and passages alike): "bites"/"bite", "infections"/"infection", "spreading"/"spread". */
export function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 6 && t.endsWith('oes')) return t.slice(0, -2); // mosquitoes -> mosquito
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

export interface LexicalHit {
  chunk: StoredChunk;
  raw: number;
  /** raw score squashed to 0..1 so it can be shown next to cosine similarities */
  score: number;
}

export function bm25Rank(query: string, chunks: StoredChunk[], topK = 5, k1 = 1.4, b = 0.75): LexicalHit[] {
  const qTerms = Array.from(new Set(tokenize(query)));
  if (qTerms.length === 0 || chunks.length === 0) return [];

  const docs = chunks.map((c) => tokenize(`${c.docName} ${c.text}`));
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const N = chunks.length;

  const hits: LexicalHit[] = [];
  docs.forEach((d, i) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    let raw = 0;
    for (const q of qTerms) {
      const f = tf.get(q) || 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
      raw += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen));
    }
    if (raw > 0) hits.push({ chunk: chunks[i], raw, score: raw / (raw + 8) });
  });

  hits.sort((x, y) => y.raw - x.raw);
  return hits.slice(0, topK);
}

export function toRetrievalResults(hits: LexicalHit[], method: RetrievalResult['method'] = 'lexical'): RetrievalResult[] {
  return hits.map((h) => ({ chunk: h.chunk, score: h.score, method }));
}
