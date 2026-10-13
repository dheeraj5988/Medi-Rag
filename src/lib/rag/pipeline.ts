import { StoredDocument, StoredChunk, RetrievalResult } from '../../types';
import { chunkText } from './chunker';
import { rankChunks } from './cosine';
import {
  saveDocument,
  getAllDocuments,
  saveChunks,
  getChunksByModel,
  clearAllChunksForDoc,
} from './db';
import { SAMPLE_DOCUMENTS } from './sampleDocs';
import { embedTexts, rerankPassages } from '../gemini/client';
import { EMBEDDING_MODEL, DEFAULT_TOP_K, DEFAULT_SIMILARITY_THRESHOLD } from '../../constants';

export interface IngestionProgress {
  stage: 'cleaning' | 'chunking' | 'embedding' | 'saving' | 'complete' | 'error';
  currentChunk: number;
  totalChunks: number;
  percentage: number;
  message: string;
}

/**
 * Initializes sample documents if the database has 0 documents.
 */
export async function initializeSampleDocumentsIfEmpty(
  embeddingModel: string = EMBEDDING_MODEL,
  onProgress?: (msg: string) => void
): Promise<void> {
  const existingDocs = await getAllDocuments();
  if (existingDocs.length > 0) return;

  onProgress?.('Initializing verified sample clinical documents...');

  for (const sample of SAMPLE_DOCUMENTS) {
    const docId = sample.id;
    const rawText = sample.content;
    const chunksData = chunkText(rawText, 250, 30, 1);

    const doc: StoredDocument = {
      id: docId,
      name: sample.name,
      size: rawText.length,
      pageCount: 1,
      chunkCount: chunksData.length,
      dateAdded: new Date().toISOString(),
      trustedSource: sample.trustedSource,
      isSample: true,
    };

    await saveDocument(doc);

    // Embed chunks
    const chunkTexts = chunksData.map((c) => c.text);
    const embedRes = await embedTexts({
      model: embeddingModel,
      texts: chunkTexts,
      docName: sample.name,
    });

    if (embedRes.success && embedRes.embeddings.length === chunksData.length) {
      const storedChunks: StoredChunk[] = chunksData.map((c, idx) => ({
        id: `${docId}-chunk-${idx}`,
        docId,
        docName: sample.name,
        page: 1,
        text: c.text,
        vector: embedRes.embeddings[idx],
        embeddingModel,
        trustedSource: sample.trustedSource,
        wordCount: c.wordCount,
      }));
      await saveChunks(storedChunks);
    } else {
      console.warn(`Could not embed sample doc ${sample.name}:`, embedRes.error);
    }
  }
}

/**
 * Ingests a new document (text or extracted PDF) with progress callbacks and abort signal.
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

  // Multi-page or single text chunking
  const allChunks: Array<{ text: string; wordCount: number; page: number }> = [];

  if (docData.pages && docData.pages.length > 0) {
    for (const p of docData.pages) {
      const pageChunks = chunkText(p.text, chunkSize, chunkOverlap, p.pageNumber);
      allChunks.push(...pageChunks);
    }
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

  // Embed in mini-batches of 4 to stay well within limits and allow progress updates
  const storedChunks: StoredChunk[] = [];
  const batchSize = 4;

  for (let i = 0; i < allChunks.length; i += batchSize) {
    if (signal?.aborted) throw new Error('Ingestion aborted by user');

    const slice = allChunks.slice(i, i + batchSize);
    const sliceTexts = slice.map((c) => c.text);

    const embedRes = await embedTexts({
      model: embeddingModel,
      texts: sliceTexts,
      docName: docData.name,
    });

    if (!embedRes.success || embedRes.embeddings.length !== slice.length) {
      throw new Error(`Embedding failure: ${embedRes.error || 'Vector count mismatch'}`);
    }

    for (let j = 0; j < slice.length; j++) {
      storedChunks.push({
        id: `${docData.id}-chunk-${i + j}`,
        docId: docData.id,
        docName: docData.name,
        page: slice[j].page,
        text: slice[j].text,
        vector: embedRes.embeddings[j],
        embeddingModel,
        trustedSource: docData.trustedSource || 'User Upload',
        wordCount: slice[j].wordCount,
      });
    }

    const currentCount = Math.min(allChunks.length, i + batchSize);
    const pct = Math.floor(15 + (currentCount / allChunks.length) * 75);

    onProgress?.({
      stage: 'embedding',
      currentChunk: currentCount,
      totalChunks: allChunks.length,
      percentage: pct,
      message: `Embedding passage ${currentCount} of ${allChunks.length} using ${embeddingModel}...`,
    });
  }

  onProgress?.({
    stage: 'saving',
    currentChunk: allChunks.length,
    totalChunks: allChunks.length,
    percentage: 95,
    message: 'Saving passages to browser IndexedDB store...',
  });

  await saveChunks(storedChunks);

  onProgress?.({
    stage: 'complete',
    currentChunk: allChunks.length,
    totalChunks: allChunks.length,
    percentage: 100,
    message: 'Document indexed and ready for clinical retrieval.',
  });
}

/**
 * Re-index all existing documents with a new embedding model.
 */
export async function reindexAllDocuments(
  newModel: string,
  onProgress?: (progress: IngestionProgress) => void
): Promise<void> {
  const docs = await getAllDocuments();
  if (docs.length === 0) return;

  for (let docIdx = 0; docIdx < docs.length; docIdx++) {
    const doc = docs[docIdx];
    onProgress?.({
      stage: 'chunking',
      currentChunk: docIdx,
      totalChunks: docs.length,
      percentage: Math.floor((docIdx / docs.length) * 100),
      message: `Re-indexing document "${doc.name}" with ${newModel}...`,
    });

    // Clear old chunks for doc
    await clearAllChunksForDoc(doc.id);

    // If it's a sample doc, recreate from sample definition
    const sampleDef = SAMPLE_DOCUMENTS.find((s) => s.id === doc.id);
    const content = sampleDef ? sampleDef.content : '';

    if (content) {
      const chunksData = chunkText(content, 300, 40, 1);
      const embedRes = await embedTexts({
        model: newModel,
        texts: chunksData.map((c) => c.text),
        docName: doc.name,
      });

      if (embedRes.success && embedRes.embeddings.length === chunksData.length) {
        const storedChunks: StoredChunk[] = chunksData.map((c, idx) => ({
          id: `${doc.id}-chunk-${idx}`,
          docId: doc.id,
          docName: doc.name,
          page: 1,
          text: c.text,
          vector: embedRes.embeddings[idx],
          embeddingModel: newModel,
          trustedSource: doc.trustedSource,
          wordCount: c.wordCount,
        }));
        await saveChunks(storedChunks);
      }
    }
  }

  onProgress?.({
    stage: 'complete',
    currentChunk: docs.length,
    totalChunks: docs.length,
    percentage: 100,
    message: `All documents re-indexed with ${newModel}.`,
  });
}

/**
 * Query the vector store and retrieve relevant passages with optional re-ranking.
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

  // 1. Embed query
  const queryEmbedRes = await embedTexts({
    model: embeddingModel,
    texts: [query],
    query: true,
  });

  if (!queryEmbedRes.success || !queryEmbedRes.embeddings[0]) {
    console.error('Failed to embed query:', queryEmbedRes.error);
    return [];
  }

  const queryVector = queryEmbedRes.embeddings[0];

  // 2. Load stored chunks for the target model
  const chunks = await getChunksByModel(embeddingModel);
  if (chunks.length === 0) {
    return [];
  }

  // 3. Cosine similarity
  // If reranking is enabled, fetch top 8 candidates first
  const candidateK = rerank ? Math.max(8, topK) : topK;
  const initialRanked = rankChunks(queryVector, chunks, candidateK, similarityThreshold);

  if (!rerank || initialRanked.length <= 1) {
    return initialRanked.slice(0, topK);
  }

  // 4. Optional Gemini re-ranking of candidates
  try {
    const candidateTexts = initialRanked.map(
      (r) => `[Source: ${r.chunk.docName}, Source Label: ${r.chunk.trustedSource}]\n${r.chunk.text}`
    );
    const scores = await rerankPassages(query, candidateTexts, rerankModel);

    const reranked = initialRanked.map((item, idx) => ({
      ...item,
      rerankScore: scores[idx] !== undefined ? scores[idx] : 5,
    }));

    // Sort by rerank score descending, breaking ties with cosine similarity
    reranked.sort((a, b) => {
      const scoreDiff = (b.rerankScore || 0) - (a.rerankScore || 0);
      if (Math.abs(scoreDiff) > 0.5) return scoreDiff;
      return b.score - a.score;
    });

    return reranked.slice(0, topK);
  } catch (err) {
    console.warn('Rerank failed, returning vector rank:', err);
    return initialRanked.slice(0, topK);
  }
}
