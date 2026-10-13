import { StoredDocument, StoredChunk, RetrievalResult } from '../../types';
import { chunkText } from './chunker';
import { rankChunks } from './cosine';
import { bm25Rank, toRetrievalResults } from './lexical';
import { saveDocument, getAllDocuments, getAllChunks, saveChunks, getChunksByModel } from './db';
import { ensureBuiltInKnowledgeBase } from './kb';
import { embedTexts, rerankPassages } from '../gemini/client';
import { EMBEDDING_MODEL, DEFAULT_TOP_K, DEFAULT_SIMILARITY_THRESHOLD } from '../../constants';

export interface IngestionProgress {
  stage: 'cleaning' | 'chunking' | 'embedding' | 'saving' | 'complete' | 'error';
  currentChunk: number;
  totalChunks: number;
  percentage: number;
  message: string;
}

const EMBED_BATCH = 16;

/**
 * Seeds the built-in MedlinePlus knowledge base (no embedding API calls) and removes legacy sample documents.
 * Kept under the old name so existing callers keep working.
 */
export async function initializeSampleDocumentsIfEmpty(embeddingModel: string = EMBEDDING_MODEL): Promise<void> {
  await ensureBuiltInKnowledgeBase(embeddingModel);
}

/**
 * Ingests a new document (text or extracted PDF) with progress callbacks and abort signal.
 * Passages are embedded in batches of 16 (one API request per batch, not per passage).
 */
export async function ingestDocument(
  docData: {
    id: string;
    name: string;
    text: string;
    pageCount: number;
    pages?: Array<{ pageNumber: number; text: string }>;
    trustedSource: string;
  },
  options: {
    embeddingModel: string;
    chunkSize?: number;
    chunkOverlap?: number;
    signal?: AbortSignal;
    onProgress?: (progress: IngestionProgress) => void;
  }
): Promise<void> {
  const { onProgress, signal, embeddingModel, chunkSize = 300, chunkOverlap = 40 } = options;

  onProgress?.({
    stage: 'cleaning',
    currentChunk: 0,
    totalChunks: 0,
    percentage: 5,
    message: 'Analyzing document structure and layout...',
  });

  if (signal?.aborted) throw new Error('Ingestion aborted by user');

  const allChunks: Array<{ text: string; wordCount: number; page: number }> = [];
  if (docData.pages && docData.pages.length > 0) {
    for (const p of docData.pages) allChunks.push(...chunkText(p.text, chunkSize, chunkOverlap, p.pageNumber));
  } else {
    allChunks.push(...chunkText(docData.text, chunkSize, chunkOverlap, 1));
  }

  if (allChunks.length === 0) {
    throw new Error('Document contained no readable text or words.');
  }

  onProgress?.({
    stage: 'chunking',
    currentChunk: 0,
    totalChunks: allChunks.length,
    percentage: 15,
    message: `Generated ${allChunks.length} paragraph-aware passages. Preparing embeddings...`,
  });

  const storedChunks: StoredChunk[] = [];
  for (let i = 0; i < allChunks.length; i += EMBED_BATCH) {
    if (signal?.aborted) throw new Error('Ingestion aborted by user');

    const slice = allChunks.slice(i, i + EMBED_BATCH);
    const embedRes = await embedTexts({
      model: embeddingModel,
      texts: slice.map((c) => c.text),
      docName: docData.name,
    });

    if (!embedRes.success || embedRes.embeddings.length !== slice.length) {
      throw new Error(`Embedding failure: ${embedRes.error || 'Vector count mismatch'}`);
    }

    slice.forEach((c, j) =>
      storedChunks.push({
        id: `${docData.id}-chunk-${i + j}`,
        docId: docData.id,
        docName: docData.name,
        page: c.page,
        text: c.text,
        vector: embedRes.embeddings[j],
        embeddingModel,
        trustedSource: docData.trustedSource || 'User Upload',
        wordCount: c.wordCount,
      })
    );

    const done = Math.min(allChunks.length, i + EMBED_BATCH);
    onProgress?.({
      stage: 'embedding',
      currentChunk: done,
      totalChunks: allChunks.length,
      percentage: Math.floor(15 + (done / allChunks.length) * 75),
      message: `Embedding passage ${done} of ${allChunks.length} using ${embeddingModel}...`,
    });
  }

  onProgress?.({
    stage: 'saving',
    currentChunk: allChunks.length,
    totalChunks: allChunks.length,
    percentage: 95,
    message: 'Saving passages to browser IndexedDB store...',
  });

  // Only now (all embeddings succeeded) record the document, so a failed upload leaves nothing half-indexed.
  const doc: StoredDocument = {
    id: docData.id,
    name: docData.name,
    size: docData.text.length,
    pageCount: docData.pageCount || 1,
    chunkCount: allChunks.length,
    dateAdded: new Date().toISOString(),
    trustedSource: docData.trustedSource || 'User Upload',
    isSample: false,
  };
  await saveDocument(doc);
  await saveChunks(storedChunks);

  onProgress?.({
    stage: 'complete',
    currentChunk: allChunks.length,
    totalChunks: allChunks.length,
    percentage: 100,
    message: 'Document indexed and ready for retrieval.',
  });
}

/**
 * Re-embed EVERY stored passage (built-in and uploaded) with a new embedding model, from the passage text
 * already in IndexedDB. (The original version deleted uploaded documents' chunks without re-embedding them.)
 */
export async function reindexAllDocuments(
  newModel: string,
  onProgress?: (progress: IngestionProgress) => void
): Promise<void> {
  const docs = await getAllDocuments();
  if (docs.length === 0) return;
  const chunks = await getAllChunks();
  if (chunks.length === 0) return;

  const updated: StoredChunk[] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const slice = chunks.slice(i, i + EMBED_BATCH);
    const res = await embedTexts({ model: newModel, texts: slice.map((c) => c.text), titles: slice.map((c) => c.docName) });
    if (!res.success || res.embeddings.length !== slice.length) {
      throw new Error(res.error || 'Vector count mismatch while re-indexing');
    }
    slice.forEach((c, j) => updated.push({ ...c, vector: res.embeddings[j], embeddingModel: newModel }));
    const done = Math.min(chunks.length, i + EMBED_BATCH);
    onProgress?.({
      stage: 'embedding',
      currentChunk: done,
      totalChunks: chunks.length,
      percentage: Math.floor((done / chunks.length) * 95),
      message: `Re-embedding passage ${done} of ${chunks.length} with ${newModel}...`,
    });
  }
  await saveChunks(updated);

  onProgress?.({
    stage: 'complete',
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    percentage: 100,
    message: `All passages re-indexed with ${newModel}.`,
  });
}

/**
 * Query the knowledge base.
 *  - Passages that have vectors are ranked by cosine similarity to the query embedding (one embedding call).
 *  - Passages without vectors (the built-in MedlinePlus set before semantic vectors are computed) are ranked by
 *    keyword (BM25), so retrieval still works with no API key and no embeddings.
 *  - Optional Gemini re-ranking (off by default; costs one extra call).
 */
export async function retrievePassages(
  query: string,
  options: {
    embeddingModel: string;
    topK?: number;
    similarityThreshold?: number;
    rerank?: boolean;
    rerankModel?: string;
  }
): Promise<RetrievalResult[]> {
  const {
    embeddingModel,
    topK = DEFAULT_TOP_K,
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    rerank = false,
    rerankModel = 'gemini-3.1-flash-lite',
  } = options;

  const all = await getAllChunks();
  if (all.length === 0) return [];
  const withVectors = all.filter((c) => c.vector && c.vector.length > 0);
  const withoutVectors = all.filter((c) => !c.vector || c.vector.length === 0);

  const candidateK = rerank ? Math.max(8, topK) : topK;
  let ranked: RetrievalResult[] = [];

  // 1. vector search over passages that have vectors for the active model
  if (withVectors.length > 0) {
    const modelChunks = await getChunksByModel(embeddingModel);
    if (modelChunks.length > 0) {
      const q = await embedTexts({ model: embeddingModel, texts: [query], query: true });
      if (q.success && q.embeddings[0]) {
        ranked.push(...rankChunks(q.embeddings[0], modelChunks, candidateK, similarityThreshold).map((r) => ({ ...r, method: 'vector' as const })));
      }
    }
  }

  // 2. keyword search over passages with no vector (and over everything if the vector search found nothing)
  const lexicalPool = ranked.length === 0 ? all : withoutVectors;
  if (lexicalPool.length > 0) {
    // keep only passages close to the best keyword match (drops weak, unrelated stragglers)
    const lex = bm25Rank(query, lexicalPool, candidateK);
    const topRaw = lex[0]?.raw ?? 0;
    ranked.push(...toRetrievalResults(lex.filter((h) => h.score >= 0.15 && h.raw >= 0.4 * topRaw)));
  }

  ranked.sort((a, b) => b.score - a.score);
  ranked = ranked.slice(0, candidateK);

  if (!rerank || ranked.length <= 1) return ranked.slice(0, topK);

  try {
    const texts = ranked.map((r) => `[Source: ${r.chunk.docName}, Source Label: ${r.chunk.trustedSource}]\n${r.chunk.text}`);
    const scores = await rerankPassages(query, texts, rerankModel);
    const reranked = ranked.map((item, idx) => ({ ...item, rerankScore: scores[idx] !== undefined ? scores[idx] : 5 }));
    reranked.sort((a, b) => {
      const diff = (b.rerankScore || 0) - (a.rerankScore || 0);
      return Math.abs(diff) > 0.5 ? diff : b.score - a.score;
    });
    return reranked.slice(0, topK);
  } catch (err) {
    console.warn('Rerank failed, returning first-stage ranking:', err);
    return ranked.slice(0, topK);
  }
}

/**
 * Passages for ONE predicted condition: only pages whose `covers` list contains that condition, ranked by keyword
 * relevance to the condition + the patient's symptoms. Deterministic, free (no API call) and works offline.
 * Falls back to normal retrieval when no built-in page covers the condition (for example a user-added document).
 */
export async function retrieveForCondition(
  condition: string,
  symptomText: string,
  options: { embeddingModel: string; topK?: number; similarityThreshold?: number }
): Promise<RetrievalResult[]> {
  const { topK = 2 } = options;
  const all = await getAllChunks();
  const pool = all.filter((c) => c.covers?.includes(condition));
  if (pool.length === 0) {
    return retrievePassages(`${condition} ${symptomText}`, { ...options, topK });
  }
  const ranked = bm25Rank(`${condition} ${symptomText}`, pool, topK);
  if (ranked.length > 0) return toRetrievalResults(ranked, 'disease-filter');
  // nothing matched by keyword: still return the page's opening passages (they cover the basics)
  return pool.slice(0, topK).map((chunk) => ({ chunk, score: 0.2, method: 'disease-filter' as const }));
}
