import { StoredDocument, StoredChunk } from '../../types';

const DB_NAME = 'medi_rag_knowledge_db';
const DB_VERSION = 1;
const DOCS_STORE = 'documents';
const CHUNKS_STORE = 'chunks';

let dbInstance: IDBDatabase | null = null;

export async function openMediRagDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(DOCS_STORE)) {
        db.createObjectStore(DOCS_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const chunkStore = db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' });
        chunkStore.createIndex('docId', 'docId', { unique: false });
        chunkStore.createIndex('embeddingModel', 'embeddingModel', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Failed to open IndexedDB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, 'readwrite');
    const store = tx.objectStore(DOCS_STORE);
    const req = store.put(doc);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllDocuments(): Promise<StoredDocument[]> {
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, 'readonly');
    const store = tx.objectStore(DOCS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDocument(docId: string): Promise<void> {
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DOCS_STORE, CHUNKS_STORE], 'readwrite');
    const docStore = tx.objectStore(DOCS_STORE);
    const chunkStore = tx.objectStore(CHUNKS_STORE);

    docStore.delete(docId);

    const index = chunkStore.index('docId');
    const keyRange = IDBKeyRange.only(docId);
    const cursorReq = index.openCursor(keyRange);

    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveChunks(chunks: StoredChunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readwrite');
    const store = tx.objectStore(CHUNKS_STORE);
    for (const chunk of chunks) {
      store.put(chunk);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChunksByModel(embeddingModel: string): Promise<StoredChunk[]> {
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readonly');
    const store = tx.objectStore(CHUNKS_STORE);
    const index = store.index('embeddingModel');
    const req = index.getAll(IDBKeyRange.only(embeddingModel));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllChunks(): Promise<StoredChunk[]> {
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readonly');
    const store = tx.objectStore(CHUNKS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllChunksForDoc(docId: string): Promise<void> {
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readwrite');
    const store = tx.objectStore(CHUNKS_STORE);
    const index = store.index('docId');
    const cursorReq = index.openCursor(IDBKeyRange.only(docId));
    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllData(): Promise<void> {
  const db = await openMediRagDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DOCS_STORE, CHUNKS_STORE], 'readwrite');
    tx.objectStore(DOCS_STORE).clear();
    tx.objectStore(CHUNKS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Replace stored chunks (same ids) - used to add vectors to built-in passages after they were first saved. */
export async function updateChunks(chunks: StoredChunk[]): Promise<void> {
  return saveChunks(chunks);
}

/** Remove every built-in or legacy sample document (and its chunks) so the shipped knowledge base can be re-seeded. */
export async function deleteBuiltInAndSampleDocuments(): Promise<void> {
  const docs = await getAllDocuments();
  for (const d of docs) {
    if (d.isBuiltIn || d.isSample) await deleteDocument(d.id);
  }
}

export async function getStorageStats(): Promise<{
  docCount: number;
  chunkCount: number;
  /** Embedding models that have real vectors in the index (keyword-only passages are not listed). */
  modelsUsed: string[];
  builtInDocCount: number;
  userDocCount: number;
  /** Passages that have no vector yet (keyword search only). */
  chunksWithoutVectors: number;
}> {
  const docs = await getAllDocuments();
  const chunks = await getAllChunks();

  const withVectors = chunks.filter((c) => c.vector && c.vector.length > 0);
  const modelsUsed = Array.from(new Set(withVectors.map((c) => c.embeddingModel))).filter(Boolean);

  return {
    docCount: docs.length,
    chunkCount: chunks.length,
    modelsUsed,
    builtInDocCount: docs.filter((d) => d.isBuiltIn).length,
    userDocCount: docs.filter((d) => !d.isBuiltIn && !d.isSample).length,
    chunksWithoutVectors: chunks.length - withVectors.length,
  };
}
