import React from 'react';
import { X, ExternalLink, ShieldCheck, FileText } from 'lucide-react';
import { RetrievalResult } from '../types';
import { FIXED_MEDICAL_DISCLAIMER } from '../constants';

interface CitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  citation: RetrievalResult | null;
  citationIndex?: number;
}

export const CitationModal: React.FC<CitationModalProps> = ({
  isOpen,
  onClose,
  citation,
  citationIndex = 1,
}) => {
  if (!isOpen || !citation) return null;

  const { chunk, score, rerankScore } = citation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
              [{citationIndex}]
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <span>{chunk.docName}</span>
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>Page {chunk.page}</span>
                <span>·</span>
                <span>Source: {chunk.trustedSource}</span>
                <span>·</span>
                <span className="font-mono">Similarity: {(score * 100).toFixed(1)}%</span>
                {rerankScore !== undefined && (
                  <>
                    <span>·</span>
                    <span className="font-mono">Rerank: {rerankScore}/10</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Exact Context Passage */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div>
            <span className="text-xs uppercase font-semibold tracking-wider text-slate-400 dark:text-slate-500">
              Verified Source Excerpt ({chunk.wordCount} words)
            </span>
            <div className="mt-2 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-sm leading-relaxed text-slate-800 dark:text-slate-200 font-normal whitespace-pre-wrap selection:bg-teal-100">
              {chunk.text}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>Retrieved from local client IndexedDB vector store ({chunk.embeddingModel})</span>
            </div>
            <span className="font-mono text-slate-400">ID: {chunk.id.slice(0, 16)}...</span>
          </div>
        </div>

        {/* Modal Footer with Mandatory Disclaimer */}
        <div className="px-6 py-3 bg-amber-50/70 dark:bg-amber-950/30 border-t border-amber-200/50 dark:border-amber-900/30 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-medium">{FIXED_MEDICAL_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
};
