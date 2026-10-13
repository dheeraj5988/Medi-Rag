import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  Database,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Type,
  Shield,
  Layers,
} from 'lucide-react';
import {
  AVAILABLE_GENERATION_MODELS,
  AVAILABLE_EMBEDDING_MODELS,
} from '../constants';
import { getAllDocuments, getAllChunks, clearAllData } from '../lib/rag/db';

interface SettingsScreenProps {
  generationModel: string;
  onSetGenerationModel: (m: string) => void;
  embeddingModel: string;
  onSetEmbeddingModel: (m: string) => void;
  topK: number;
  onSetTopK: (k: number) => void;
  similarityThreshold: number;
  onSetSimilarityThreshold: (th: number) => void;
  rerankEnabled: boolean;
  onSetRerankEnabled: (enabled: boolean) => void;
  textSize: 'normal' | 'large';
  onSetTextSize: (size: 'normal' | 'large') => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  generationModel,
  onSetGenerationModel,
  embeddingModel,
  onSetEmbeddingModel,
  topK,
  onSetTopK,
  similarityThreshold,
  onSetSimilarityThreshold,
  rerankEnabled,
  onSetRerankEnabled,
  textSize,
  onSetTextSize,
}) => {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  // Export all IndexedDB data to JSON file
  const handleExportData = async () => {
    try {
      const docs = await getAllDocuments();
      const chunks = await getAllChunks();
      const payload = {
        exportedAt: new Date().toISOString(),
        documents: docs,
        chunks: chunks,
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `medi_rag_export_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setExportMessage(`Successfully exported ${docs.length} documents and ${chunks.length} vector chunks.`);
    } catch (err: unknown) {
      setExportMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Delete all user data
  const handleDeleteAllData = async () => {
    if (!window.confirm('Are you sure you want to delete ALL documents, chunks, and chat history? This action is permanent and cannot be undone.')) {
      return;
    }

    try {
      await clearAllData();
      localStorage.removeItem('medi_rag_chat_history');
      setDeleteMessage('All IndexedDB documents, vectors, and chat history have been permanently wiped.');
    } catch (err: unknown) {
      setDeleteMessage(`Failed to clear data: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-teal-600" />
          <span>System & RAG Hyperparameters</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Customize generation & embedding models, vector retrieval thresholds, typography scale, and data export.
        </p>
      </div>

      {exportMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 dark:text-emerald-300 text-xs rounded-lg flex items-center justify-between">
          <span>{exportMessage}</span>
          <button onClick={() => setExportMessage(null)} className="text-emerald-700 font-bold ml-2">
            Dismiss
          </button>
        </div>
      )}

      {deleteMessage && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-800 dark:text-rose-300 text-xs rounded-lg flex items-center justify-between">
          <span>{deleteMessage}</span>
          <button onClick={() => setDeleteMessage(null)} className="text-rose-700 font-bold ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Model Selection */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Layers className="w-4 h-4 text-teal-600" />
          <span>Gemini Model Architecture</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Generation & Synthesis Model
            </label>
            <select
              value={generationModel}
              onChange={(e) => onSetGenerationModel(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {AVAILABLE_GENERATION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Primary model used for streaming responses & symptom structured extraction.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Vector Embedding Model
            </label>
            <select
              value={embeddingModel}
              onChange={(e) => onSetEmbeddingModel(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {AVAILABLE_EMBEDDING_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              If changed, visit the Knowledge Base or click below to re-index documents.
            </p>
          </div>
        </div>
      </div>

      {/* RAG Hyperparameters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-teal-600" />
          <span>Vector Search & Re-ranking Parameters</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top-K */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Top-K Passages Retrieved:
              </span>
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                {topK} passages
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={topK}
              onChange={(e) => onSetTopK(Number(e.target.value))}
              className="w-full accent-teal-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Number of most relevant passage chunks injected into the synthesis context.
            </p>
          </div>

          {/* Similarity Threshold */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Minimum Cosine Similarity Threshold:
              </span>
              <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                {(similarityThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={similarityThreshold}
              onChange={(e) => onSetSimilarityThreshold(Number(e.target.value))}
              className="w-full accent-teal-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Passages scoring below this similarity score are discarded as irrelevant.
            </p>
          </div>
        </div>

        {/* Re-ranking Toggle */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={rerankEnabled}
              onChange={(e) => onSetRerankEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Enable Gemini Re-Ranking on Candidate Passages
              </span>
              <p className="text-[11px] text-slate-500">
                Fetches candidate passages via vector cosine similarity, then asks Gemini to rescore relevance on a scale of 0 to 10.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Accessibility & Typography */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Type className="w-4 h-4 text-teal-600" />
          <span>Accessibility & Visual Ergonomics</span>
        </h2>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
            Reading Font Size
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => onSetTextSize('normal')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                textSize === 'normal'
                  ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-800 dark:text-teal-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600'
              }`}
            >
              Standard (14px)
            </button>
            <button
              onClick={() => onSetTextSize('large')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                textSize === 'large'
                  ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-800 dark:text-teal-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600'
              }`}
            >
              Large Accessible (16px)
            </button>
          </div>
        </div>
      </div>

      {/* Data Management & Privacy */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          <span>Local IndexedDB Data Management</span>
        </h2>

        <p className="text-xs text-slate-500 leading-relaxed">
          Medi-RAG stores all documents, vectors, and chat history exclusively in your browser's private IndexedDB database. You can export a full JSON snapshot or wipe everything.
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4 text-teal-600" />
            <span>Export Data (JSON)</span>
          </button>

          <button
            onClick={handleDeleteAllData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs font-semibold transition-colors"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Delete All My Data (Reset)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
