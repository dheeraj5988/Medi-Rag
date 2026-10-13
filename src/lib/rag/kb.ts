import { StoredChunk, StoredDocument } from '../../types';
import { KB_VERSION, BUILTIN_KB_SOURCE_LABEL } from '../../constants';
import { deleteBuiltInAndSampleDocuments, getAllChunks, getAllDocuments, saveChunks, saveDocument, updateChunks } from './db';
import { embedTexts } from '../gemini/client';

/** One passage as shipped in public/kb/kb_chunks.json (MedlinePlus, public domain). */
interface KbChunkFile {
  id: string;
  title: string;
  url: string;
  covers: string[];
  source: string;
  text: string;
}

interface KbVectorsFile {
  model: string;
  dimension: number;
  vectors: Record<string, number[]>;
}

const VERSION_KEY = 'medi_rag_kb_version';
let seeding: Promise<void> | null = null;

function docIdOf(chunkId: string): string {
  return `kb-${chunkId.replace(/-\d+$/, '')}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Seed the built-in MedlinePlus knowledge base on first run (or when the shipped version changes).
 * Passages are searchable immediately by keyword (BM25); vectors are attached when a precomputed
 * public/kb/kb_vectors.json exists for the active embedding model. NO embedding API calls are made here.
 * Legacy AI-written "SAMPLE" documents from older versions are removed.
 */
export function ensureBuiltInKnowledgeBase(embeddingModel: string): Promise<void> {
  if (!seeding) {
    seeding = seed(embeddingModel).finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

async function seed(embeddingModel: string): Promise<void> {
  const docs = await getAllDocuments();
  const hasLegacy = docs.some((d) => d.isSample);
  const upToDate = localStorage.getItem(VERSION_KEY) === KB_VERSION && docs.some((d) => d.isBuiltIn);
  if (upToDate && !hasLegacy) return;

  const file = await fetchJson<KbChunkFile[]>('/kb/kb_chunks.json');
  if (!file || file.length === 0) {
    console.warn('[Medi-RAG] Built-in knowledge base file missing: /kb/kb_chunks.json');
    return;
  }
  const vectorFile = await fetchJson<KbVectorsFile>('/kb/kb_vectors.json');
  const useVectors = vectorFile && vectorFile.model === embeddingModel ? vectorFile : null;

  await deleteBuiltInAndSampleDocuments();

  const byDoc = new Map<string, KbChunkFile[]>();
  for (const c of file) {
    const id = docIdOf(c.id);
    byDoc.set(id, [...(byDoc.get(id) || []), c]);
  }

  const date = new Date().toISOString();
  const chunks: StoredChunk[] = [];
  for (const [id, list] of byDoc) {
    const first = list[0];
    const doc: StoredDocument = {
      id,
      name: first.title,
      size: list.reduce((a, c) => a + c.text.length, 0),
      pageCount: 1,
      chunkCount: list.length,
      dateAdded: date,
      trustedSource: BUILTIN_KB_SOURCE_LABEL,
      isSample: false,
      isBuiltIn: true,
      url: first.url,
      covers: first.covers,
    };
    await saveDocument(doc);
    for (const c of list) {
      const vector = useVectors?.vectors[c.id];
      chunks.push({
        id: c.id,
        docId: id,
        docName: c.title,
        page: 1,
        text: c.text,
        vector: vector || [],
        embeddingModel: vector ? embeddingModel : '',
        trustedSource: BUILTIN_KB_SOURCE_LABEL,
        wordCount: c.text.split(/\s+/).length,
        url: c.url,
        covers: c.covers,
      });
    }
  }
  await saveChunks(chunks);
  localStorage.setItem(VERSION_KEY, KB_VERSION);
}

/** Re-create the shipped knowledge base from public/kb (for example after deleting pages by mistake). */
export async function resetBuiltInKnowledgeBase(embeddingModel: string): Promise<void> {
  localStorage.removeItem(VERSION_KEY);
  return ensureBuiltInKnowledgeBase(embeddingModel);
}

/**
 * Optional: compute semantic vectors for built-in passages that have none (user-initiated; uses the Gemini
 * embedding API in batches of 16, about 14 requests for the whole knowledge base).
 */
export async function embedBuiltInPassages(
  embeddingModel: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<{ embedded: number; error?: string }> {
  const all = await getAllChunks();
  const todo = all.filter((c) => c.docId.startsWith('kb-') && (!c.vector || c.vector.length === 0 || c.embeddingModel !== embeddingModel));
  const batch = 16;
  let embedded = 0;
  for (let i = 0; i < todo.length; i += batch) {
    if (signal?.aborted) return { embedded, error: 'Cancelled' };
    const slice = todo.slice(i, i + batch);
    const res = await embedTexts({ model: embeddingModel, texts: slice.map((c) => c.text), titles: slice.map((c) => c.docName) });
    if (!res.success || res.embeddings.length !== slice.length) {
      return { embedded, error: res.error || 'Vector count mismatch' };
    }
    await updateChunks(slice.map((c, j) => ({ ...c, vector: res.embeddings[j], embeddingModel })));
    embedded += slice.length;
    onProgress?.(embedded, todo.length);
  }
  return { embedded };
}
