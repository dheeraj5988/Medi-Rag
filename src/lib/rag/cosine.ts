import { StoredChunk, RetrievalResult } from '../../types';

/**
 * Computes cosine similarity between two numeric vectors: (A . B) / (||A|| * ||B||).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  if (vecA.length !== vecB.length) {
    console.warn(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) return 0;
  const score = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  // Bound to [-1, 1] to avoid float rounding edge-cases
  return Math.max(-1, Math.min(1, score));
}

/**
 * L2 Normalizes a vector in-place or returns a normalized copy.
 */
export function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vector.slice();
  return vector.map((v) => v / norm);
}

/**
 * Rank chunks by cosine similarity against the query vector.
 * Filters out scores below minThreshold and takes top k.
 */
export function rankChunks(
  queryVector: number[],
  chunks: StoredChunk[],
  topK: number = 5,
  minThreshold: number = 0.35
): RetrievalResult[] {
  if (!queryVector || chunks.length === 0) return [];

  const scored: RetrievalResult[] = [];

  for (const chunk of chunks) {
    const score = cosineSimilarity(queryVector, chunk.vector);
    if (score >= minThreshold) {
      scored.push({
        chunk,
        score,
      });
    }
  }

  // Sort descending by similarity score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
