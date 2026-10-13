import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  BookOpen,
  Info,
  Shield,
  FileUp,
  X,
} from 'lucide-react';
import { StoredDocument } from '../types';
import {
  getAllDocuments,
  deleteDocument,
  getStorageStats,
  saveDocument,
} from '../lib/rag/db';
import {
  ingestDocument,
  reindexAllDocuments,
  IngestionProgress,
  initializeSampleDocumentsIfEmpty,
} from '../lib/rag/pipeline';
import { extractTextFromPDF } from '../lib/pdf/extractor';
import {
  EMBEDDING_MODEL,
  SAMPLE_DOCS_BANNER_TEXT,
  DEFAULT_CHUNK_SIZE_WORDS,
  DEFAULT_CHUNK_OVERLAP_WORDS,
} from '../constants';

interface KnowledgeBaseScreenProps {
  embeddingModel: string;
  onModelReindexNeeded?: () => void;
}

export const KnowledgeBaseScreen: React.FC<KnowledgeBaseScreenProps> = ({
  embeddingModel,
}) => {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [isOnlySampleDocs, setIsOnlySampleDocs] = useState(false);
  const [modelsInIndex, setModelsInIndex] = useState<string[]>([]);

  // Ingestion State
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Paste Text Modal State
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
      const docs = await getAllDocuments();
      setDocuments(docs);
      const stats = await getStorageStats();
      setIsOnlySampleDocs(stats.isOnlySampleDocs);
      setModelsInIndex(stats.modelsUsed);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [embeddingModel]);

  // Handle Drag & Drop / File Input
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIngestionError(null);

    abortControllerRef.current = new AbortController();

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];

      // File size limit (25 MB max)
      if (file.size > 25 * 1024 * 1024) {
        setIngestionError(`File "${file.name}" exceeds the 25 MB limit.`);
        continue;
      }

      try {
        let extractedText = '';
        let pageCount = 1;
        let pdfPages: Array<{ pageNumber: number; text: string }> = [];

        if (file.name.endsWith('.pdf')) {
          setProgress({
            stage: 'cleaning',
            currentChunk: 0,
            totalChunks: 0,
            percentage: 5,
            message: `Extracting text from PDF "${file.name}" using pdfjs-dist...`,
          });

          const buffer = await file.arrayBuffer();
          const pdfResult = await extractTextFromPDF(buffer);

          if (pdfResult.isScannedWarning) {
            setIngestionError(
              `Warning: "${file.name}" appears to be a scanned image-only PDF. Browser text extraction could not find readable characters (OCR is not supported).`
            );
          }

          extractedText = pdfResult.totalText;
          pageCount = pdfResult.totalPages;
          pdfPages = pdfResult.pages;
        } else {
          // Plain text / Markdown
          extractedText = await file.text();
        }

        if (!extractedText.trim()) {
          setIngestionError(`File "${file.name}" contains no readable text.`);
          continue;
        }

        const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        await ingestDocument(
          {
            id: docId,
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
            onProgress: (p) => setProgress(p),
          }
        );
      } catch (err: unknown) {
        if (abortControllerRef.current?.signal.aborted) {
          setIngestionError('Ingestion cancelled by user.');
          break;
        }
        setIngestionError(`Ingestion failed for "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setProgress(null);
    abortControllerRef.current = null;
    await loadDocs();
  };

  // Handle Cancel Ingestion
  const handleCancelIngestion = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setProgress(null);
    }
  };

  // Handle Paste Text Submission
  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteTitle.trim() || !pasteContent.trim()) return;

    setIngestionError(null);
    setShowPasteModal(false);

    try {
      abortControllerRef.current = new AbortController();
      const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      await ingestDocument(
        {
          id: docId,
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
          onProgress: (p) => setProgress(p),
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

  // Handle Delete Document
  const handleDeleteDoc = async (docId: string) => {
    await deleteDocument(docId);
    await loadDocs();
  };

  // Handle Update Trusted Source Label
  const handleSaveSourceLabel = async (doc: StoredDocument) => {
    const updated = { ...doc, trustedSource: editedSource };
    await saveDocument(updated);
    setEditingDocId(null);
    await loadDocs();
  };

  // Handle Re-index All Documents
  const handleReindexAll = async () => {
    if (!window.confirm(`Re-index all documents using ${embeddingModel}? This will re-embed all chunks.`)) {
      return;
    }
    setIngestionError(null);
    try {
      await reindexAllDocuments(embeddingModel, (p) => setProgress(p));
    } catch (err: unknown) {
      setIngestionError(`Re-indexing error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProgress(null);
      await loadDocs();
    }
  };

  const hasIncompatibleModels = modelsInIndex.some((m) => m !== embeddingModel);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Screen Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <span>Trusted Medical Knowledge Base</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Upload verified clinical guidelines (WHO, CDC, MedlinePlus) in PDF, TXT, or MD format. Stored locally in browser IndexedDB.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Paste Clinical Text</span>
          </button>
          <button
            onClick={handleReindexAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-Index All</span>
          </button>
        </div>
      </div>

      {/* Sample Docs Banner Warning */}
      {isOnlySampleDocs && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider block">Sample Knowledge Base Active</span>
            <p className="mt-1 leading-relaxed">{SAMPLE_DOCS_BANNER_TEXT}</p>
          </div>
        </div>
      )}

      {/* Model Incompatibility Alert */}
      {hasIncompatibleModels && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold">Embedding Model Incompatibility Detected:</span>
              <p className="mt-0.5">
                Current active model is <span className="font-mono font-bold">{embeddingModel}</span>, but some index chunks were generated with [{modelsInIndex.join(', ')}]. Vectors from different models cannot be compared.
              </p>
            </div>
          </div>
          <button
            onClick={handleReindexAll}
            className="px-3 py-1.5 rounded-md bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs shrink-0 whitespace-nowrap"
          >
            Re-Index with {embeddingModel}
          </button>
        </div>
      )}

      {/* Ingestion Progress Bar */}
      {progress && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-900 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-teal-800 dark:text-teal-300">
              {progress.message}
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                {progress.percentage}%
              </span>
              <button
                onClick={handleCancelIngestion}
                className="text-xs text-rose-600 hover:underline font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-teal-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {ingestionError && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {ingestionError}</span>
          <button onClick={() => setIngestionError(null)} className="text-rose-600 font-bold ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500 rounded-2xl p-8 text-center bg-slate-50/50 dark:bg-slate-900/50 transition-colors cursor-pointer group"
        onClick={() => document.getElementById('kb-file-input')?.click()}
      >
        <input
          id="kb-file-input"
          type="file"
          multiple
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <div className="w-12 h-12 mx-auto rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
          <Upload className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          Drag & drop medical documents here, or click to browse
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Supports PDF (with multi-page extraction), TXT, and Markdown files up to 25 MB.
        </p>
        <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-slate-400">
          <span>· Paragraph-aware chunking (~300 words)</span>
          <span>· 40-word overlap</span>
          <span>· Real {embeddingModel} vectors</span>
        </div>
      </div>

      {/* Document Library Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Stored Documents ({documents.length})
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Active Embedding Model: {embeddingModel}
          </span>
        </div>

        {loadingDocs ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading IndexedDB storage...</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No documents in knowledge base. Upload a document or paste clinical text above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-100/70 dark:bg-slate-800/70 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">Document Name</th>
                  <th className="px-4 py-2.5">Trusted Source</th>
                  <th className="px-4 py-2.5">Pages</th>
                  <th className="px-4 py-2.5">Passage Chunks</th>
                  <th className="px-4 py-2.5">Size</th>
                  <th className="px-4 py-2.5">Date Added</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="truncate max-w-xs">{doc.name}</span>
                      {doc.isSample && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-normal">
                          Sample
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingDocId === doc.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editedSource}
                            onChange={(e) => setEditedSource(e.target.value)}
                            className="px-2 py-0.5 border rounded text-xs w-28 bg-white dark:bg-slate-800"
                          />
                          <button
                            onClick={() => handleSaveSourceLabel(doc)}
                            className="text-teal-600 font-bold hover:underline"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingDocId(doc.id);
                            setEditedSource(doc.trustedSource);
                          }}
                          className="hover:underline flex items-center gap-1 text-slate-700 dark:text-slate-300"
                          title="Click to edit trusted source label"
                        >
                          <Shield className="w-3 h-3 text-teal-600" />
                          <span>{doc.trustedSource}</span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{doc.pageCount}</td>
                    <td className="px-4 py-3 font-mono">{doc.chunkCount}</td>
                    <td className="px-4 py-3 font-mono">
                      {doc.size > 1024 * 1024
                        ? `${(doc.size / (1024 * 1024)).toFixed(1)} MB`
                        : `${(doc.size / 1024).toFixed(1)} KB`}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(doc.dateAdded).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                        title="Delete document and its vector chunks"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paste Text Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Paste Clinical Guidelines or Document Text
              </h3>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePasteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="e.g. WHO Guidelines on Dengue Management"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Trusted Source Attribution Label
                </label>
                <input
                  type="text"
                  value={pasteSource}
                  onChange={(e) => setPasteSource(e.target.value)}
                  placeholder="e.g. WHO, CDC, NHS, MedlinePlus"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Clinical Text Content
                </label>
                <textarea
                  rows={8}
                  required
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste verified medical excerpts, symptoms, precautions, and warning signs here..."
                  className="w-full p-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-teal-700 hover:bg-teal-800 text-white rounded-lg shadow-xs"
                >
                  Chunk & Index Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
