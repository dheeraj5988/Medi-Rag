import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Plus,
  BookOpen,
  Info,
  Shield,
  ExternalLink,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { StoredDocument } from '../types';
import { getAllDocuments, deleteDocument, getStorageStats, saveDocument } from '../lib/rag/db';
import { ingestDocument, reindexAllDocuments, IngestionProgress, initializeSampleDocumentsIfEmpty } from '../lib/rag/pipeline';
import { embedBuiltInPassages, resetBuiltInKnowledgeBase } from '../lib/rag/kb';
import { fetchHealth } from '../lib/gemini/client';
import { extractTextFromPDF } from '../lib/pdf/extractor';
import { Sheet } from '../components/Sheet';
import { BUILTIN_KB_BANNER_TEXT, DEFAULT_CHUNK_SIZE_WORDS, DEFAULT_CHUNK_OVERLAP_WORDS } from '../constants';

interface KnowledgeBaseScreenProps {
  embeddingModel: string;
  onModelReindexNeeded?: () => void;
}

const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`);

export const KnowledgeBaseScreen: React.FC<KnowledgeBaseScreenProps> = ({ embeddingModel }) => {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [modelsInIndex, setModelsInIndex] = useState<string[]>([]);
  const [withoutVectors, setWithoutVectors] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [hasKey, setHasKey] = useState(false);

  // Ingestion State
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Paste Text Sheet State
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteSource, setPasteSource] = useState('WHO / CDC Guidelines');
  const [pasteContent, setPasteContent] = useState('');

  // Trusted Source Edit
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editedSource, setEditedSource] = useState('');

  const loadDocs = async () => {
    setLoadingDocs(true);
    try {
      await initializeSampleDocumentsIfEmpty(embeddingModel);
      setDocuments(await getAllDocuments());
      const stats = await getStorageStats();
      setModelsInIndex(stats.modelsUsed);
      setWithoutVectors(stats.chunksWithoutVectors);
      setTotalChunks(stats.chunkCount);
      setHasKey((await fetchHealth()).hasApiKey);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [embeddingModel]);

  const builtIn = documents.filter((d) => d.isBuiltIn);
  const userDocs = documents.filter((d) => !d.isBuiltIn);

  // Handle Drag & Drop / File Input
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIngestionError(null);
    abortControllerRef.current = new AbortController();

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      if (file.size > 25 * 1024 * 1024) {
        setIngestionError(`File "${file.name}" exceeds the 25 MB limit.`);
        continue;
      }
      try {
        let extractedText = '';
        let pageCount = 1;
        let pdfPages: Array<{ pageNumber: number; text: string }> = [];

        if (file.name.toLowerCase().endsWith('.pdf')) {
          setProgress({ stage: 'cleaning', currentChunk: 0, totalChunks: 0, percentage: 5, message: `Extracting text from PDF "${file.name}"...` });
          const pdfResult = await extractTextFromPDF(await file.arrayBuffer());
          if (pdfResult.isScannedWarning) {
            setIngestionError(`"${file.name}" looks like a scanned image-only PDF. Browser text extraction found no readable text (OCR is not supported).`);
          }
          extractedText = pdfResult.totalText;
          pageCount = pdfResult.totalPages;
          pdfPages = pdfResult.pages;
        } else {
          extractedText = await file.text();
        }

        if (!extractedText.trim()) {
          setIngestionError(`File "${file.name}" contains no readable text.`);
          continue;
        }

        await ingestDocument(
          {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            text: extractedText,
            pageCount,
            pages: pdfPages,
            trustedSource: 'User Upload',
          },
          {
            embeddingModel,
            chunkSize: DEFAULT_CHUNK_SIZE_WORDS,
            chunkOverlap: DEFAULT_CHUNK_OVERLAP_WORDS,
            signal: abortControllerRef.current.signal,
            onProgress: setProgress,
          }
        );
      } catch (err: unknown) {
        if (abortControllerRef.current?.signal.aborted) {
          setIngestionError('Ingestion cancelled.');
          break;
        }
        setIngestionError(`Ingestion failed for "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setProgress(null);
    abortControllerRef.current = null;
    await loadDocs();
  };

  const handleCancelIngestion = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setProgress(null);
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteTitle.trim() || !pasteContent.trim()) return;
    setIngestionError(null);
    setShowPasteModal(false);
    try {
      abortControllerRef.current = new AbortController();
      await ingestDocument(
        {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: pasteTitle.trim(),
          text: pasteContent.trim(),
          pageCount: 1,
          trustedSource: pasteSource.trim() || 'Pasted Clinical Text',
        },
        {
          embeddingModel,
          chunkSize: DEFAULT_CHUNK_SIZE_WORDS,
          chunkOverlap: DEFAULT_CHUNK_OVERLAP_WORDS,
          signal: abortControllerRef.current.signal,
          onProgress: setProgress,
        }
      );
      setPasteTitle('');
      setPasteContent('');
    } catch (err: unknown) {
      setIngestionError(`Failed to index text: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProgress(null);
      await loadDocs();
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    await deleteDocument(docId);
    await loadDocs();
  };

  const handleSaveSourceLabel = async (doc: StoredDocument) => {
    await saveDocument({ ...doc, trustedSource: editedSource });
    setEditingDocId(null);
    await loadDocs();
  };

  const handleReindexAll = async () => {
    if (!window.confirm(`Re-embed ALL passages (${totalChunks}) using ${embeddingModel}? This uses the Gemini embedding API.`)) return;
    setIngestionError(null);
    try {
      await reindexAllDocuments(embeddingModel, setProgress);
    } catch (err: unknown) {
      setIngestionError(`Re-indexing error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProgress(null);
      await loadDocs();
    }
  };

  const handleEmbedBuiltIn = async () => {
    setIngestionError(null);
    abortControllerRef.current = new AbortController();
    const result = await embedBuiltInPassages(
      embeddingModel,
      (done, total) =>
        setProgress({ stage: 'embedding', currentChunk: done, totalChunks: total, percentage: Math.round((done / total) * 100), message: `Computing semantic vectors ${done} of ${total}...` }),
      abortControllerRef.current.signal
    );
    if (result.error) setIngestionError(`Semantic vectors stopped: ${result.error}`);
    setProgress(null);
    abortControllerRef.current = null;
    await loadDocs();
  };

  const handleRestoreBuiltIn = async () => {
    if (!window.confirm('Restore the built-in MedlinePlus knowledge base? Your uploaded documents are kept.')) return;
    await resetBuiltInKnowledgeBase(embeddingModel);
    await loadDocs();
  };

  const hasIncompatibleModels = modelsInIndex.some((m) => m !== embeddingModel);

  const SourceCell: React.FC<{ doc: StoredDocument }> = ({ doc }) =>
    editingDocId === doc.id ? (
      <div className="flex items-center gap-2">
        <input type="text" value={editedSource} onChange={(e) => setEditedSource(e.target.value)} className="field !py-1 w-40" aria-label="Trusted source label" />
        <button onClick={() => handleSaveSourceLabel(doc)} className="btn btn-sm">Save</button>
      </div>
    ) : (
      <button
        onClick={() => {
          setEditingDocId(doc.id);
          setEditedSource(doc.trustedSource);
        }}
        className="inline-flex items-center gap-1 text-left hover:underline"
        title="Edit trusted source label"
      >
        <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>{doc.trustedSource}</span>
      </button>
    );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 md:py-8 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="kicker">Where answers come from</span>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-[1.05] mt-1 flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-teal-600 shrink-0" aria-hidden="true" />
            <span>Knowledge library</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-xl">
            Built-in MedlinePlus pages plus anything you add (PDF, TXT, Markdown). Stored only in this browser.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowPasteModal(true)} className="btn btn-sm">
            <Plus className="w-4 h-4" />
            <span>Paste text</span>
          </button>
          <button onClick={handleReindexAll} className="btn btn-sm" disabled={!hasKey}>
            <RefreshCw className="w-4 h-4" />
            <span>Re-index all</span>
          </button>
        </div>
      </div>

      {/* Built-in knowledge base status */}
      <div className="card-flat p-4 flex items-start gap-3 text-sm">
        <Info className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-2 min-w-0">
          <p className="leading-relaxed">{BUILTIN_KB_BANNER_TEXT}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {totalChunks} passages · {withoutVectors === 0 ? 'semantic vectors ready' : `${withoutVectors} passages use keyword search (no vectors yet)`}. Keyword search works with no API key.
          </p>
          {withoutVectors > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleEmbedBuiltIn} disabled={!hasKey || Boolean(progress)} className="btn btn-sm btn-primary">
                <Sparkles className="w-4 h-4" />
                <span>Add semantic vectors</span>
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {hasKey ? `About ${Math.ceil(withoutVectors / 16)} Gemini embedding requests, once.` : 'Needs GEMINI_API_KEY on the server.'}
              </span>
            </div>
          )}
        </div>
      </div>

      {hasIncompatibleModels && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border-[1.5px] border-rose-400 text-rose-900 dark:text-rose-200 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              <b>Embedding model mismatch.</b> The active model is <span className="font-mono font-bold">{embeddingModel}</span>, but some passages were embedded with [{modelsInIndex.join(', ')}]. Vectors from different models cannot be compared.
            </p>
          </div>
          <button onClick={handleReindexAll} className="btn btn-danger btn-sm shrink-0">Re-index with {embeddingModel}</button>
        </div>
      )}

      {progress && (
        <div className="card p-4 space-y-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-bold">{progress.message}</span>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono font-bold">{progress.percentage}%</span>
              <button onClick={handleCancelIngestion} className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
          <div className="meter"><i style={{ width: `${progress.percentage}%` }} /></div>
        </div>
      )}

      {ingestionError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border-[1.5px] border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm flex items-start justify-between gap-3">
          <span>{ingestionError}</span>
          <button onClick={() => setIngestionError(null)} className="btn btn-ghost btn-sm shrink-0">Dismiss</button>
        </div>
      )}

      {/* Upload zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-slate-400 dark:border-slate-600 hover:border-teal-600 rounded-3xl p-6 sm:p-8 text-center bg-white/60 dark:bg-slate-900/50 transition-colors cursor-pointer group"
        onClick={() => document.getElementById('kb-file-input')?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && document.getElementById('kb-file-input')?.click()}
        aria-label="Upload medical documents"
      >
        <input id="kb-file-input" type="file" multiple accept=".pdf,.txt,.md" className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />
        <div className="w-14 h-14 mx-auto rounded-2xl bg-lime-400 text-slate-900 border-[1.5px] border-slate-900 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-xs">
          <Upload className="w-7 h-7" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-bold">Add trusted documents</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Tap to choose files, or drop them here. PDF, TXT or Markdown, up to 25 MB.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">~300-word passages · 40-word overlap · {embeddingModel} vectors</p>
      </div>

      {/* Your documents */}
      <section className="card overflow-hidden" aria-labelledby="kb-user">
        <div className="px-4 sm:px-5 py-3 border-b-[1.5px] border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <h2 id="kb-user" className="text-lg font-bold">Your documents ({userDocs.length})</h2>
        </div>
        {loadingDocs ? (
          <p className="p-6 text-center text-sm text-slate-500">Loading...</p>
        ) : userDocs.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Nothing added yet. The built-in MedlinePlus library below is already searchable.</p>
        ) : (
          <div className="p-3 md:p-0">
            <table className="rtable text-sm md:text-left">
              <thead className="hidden md:table-header-group bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs">
                <tr>
                  <th className="px-4 py-2.5">Document</th>
                  <th className="px-4 py-2.5">Trusted source</th>
                  <th className="px-4 py-2.5">Pages</th>
                  <th className="px-4 py-2.5">Passages</th>
                  <th className="px-4 py-2.5">Size</th>
                  <th className="px-4 py-2.5">Added</th>
                  <th className="px-4 py-2.5 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="md:divide-y md:divide-slate-100 md:dark:divide-slate-800">
                {userDocs.map((doc) => (
                  <tr key={doc.id}>
                    <td data-label="Document" className="md:px-4 md:py-3 font-bold"><span className="inline-flex items-center gap-2"><FileText className="w-4 h-4 text-teal-600 shrink-0" aria-hidden="true" /><span className="break-all">{doc.name}</span></span></td>
                    <td data-label="Source" className="md:px-4 md:py-3"><SourceCell doc={doc} /></td>
                    <td data-label="Pages" className="md:px-4 md:py-3 font-mono">{doc.pageCount}</td>
                    <td data-label="Passages" className="md:px-4 md:py-3 font-mono">{doc.chunkCount}</td>
                    <td data-label="Size" className="md:px-4 md:py-3 font-mono">{formatSize(doc.size)}</td>
                    <td data-label="Added" className="md:px-4 md:py-3">{new Date(doc.dateAdded).toLocaleDateString()}</td>
                    <td data-label="" className="md:px-4 md:py-3 md:text-right">
                      <button onClick={() => handleDeleteDoc(doc.id)} className="btn btn-ghost btn-sm text-rose-700 dark:text-rose-300" aria-label={`Delete ${doc.name}`}>
                        <Trash2 className="w-4 h-4" /> <span className="md:hidden">Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Built-in library */}
      <details className="card overflow-hidden group" open={false}>
        <summary className="px-4 sm:px-5 py-3 cursor-pointer list-none flex items-center justify-between gap-3 select-none">
          <span className="text-lg font-bold font-display">Built-in MedlinePlus library ({builtIn.length} pages)</span>
          <span className="text-xs font-bold text-slate-500 group-open:hidden">Show</span>
          <span className="text-xs font-bold text-slate-500 hidden group-open:inline">Hide</span>
        </summary>
        <div className="px-4 sm:px-5 pb-4 space-y-3 border-t-[1.5px] border-slate-200 dark:border-slate-700 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {builtIn.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm">
                <div className="min-w-0">
                  <p className="font-bold truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{doc.chunkCount} passages{doc.covers && doc.covers.length ? ` · ${doc.covers.join(', ')}` : ''}</p>
                </div>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm shrink-0" aria-label={`Open ${doc.name} on MedlinePlus`}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
          <button onClick={handleRestoreBuiltIn} className="btn btn-sm">
            <RotateCcw className="w-4 h-4" />
            <span>Restore built-in library</span>
          </button>
        </div>
      </details>

      {/* Paste text sheet */}
      <Sheet open={showPasteModal} onClose={() => setShowPasteModal(false)} title="Paste clinical text">
        <form onSubmit={handlePasteSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="kb-title">Document title</label>
            <input id="kb-title" type="text" required value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="e.g. WHO guidance on dengue" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="kb-source">Trusted source label</label>
            <input id="kb-source" type="text" value={pasteSource} onChange={(e) => setPasteSource(e.target.value)} placeholder="e.g. WHO, CDC, NHS" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="kb-content">Text</label>
            <textarea id="kb-content" rows={8} required value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} placeholder="Paste verified medical text here..." className="field" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowPasteModal(false)} className="btn btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!hasKey}>Chunk and index</button>
          </div>
          {!hasKey && <p className="text-xs text-slate-500">Indexing your own text needs a Gemini key on the server (it creates the embeddings).</p>}
        </form>
      </Sheet>
    </div>
  );
};
