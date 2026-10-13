import React from 'react';
import { ExternalLink, ShieldCheck, FileText } from 'lucide-react';
import { RetrievalResult } from '../types';
import { FIXED_MEDICAL_DISCLAIMER } from '../constants';
import { Sheet } from './Sheet';

interface CitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  citation: RetrievalResult | null;
  citationIndex?: number;
}

const METHOD_LABEL: Record<NonNullable<RetrievalResult['method']>, string> = {
  vector: 'Semantic match',
  lexical: 'Keyword match',
  'disease-filter': 'Matched to predicted condition',
};

/** Bottom sheet on phones, centred dialog on larger screens. */
export const CitationModal: React.FC<CitationModalProps> = ({ isOpen, onClose, citation, citationIndex = 1 }) => {
  if (!citation) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const { chunk, score, rerankScore, method } = citation;

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-8 h-8 rounded-lg bg-lime-400 text-slate-900 border-[1.5px] border-slate-900 flex items-center justify-center text-sm font-extrabold">
            {citationIndex}
          </span>
          <span className="truncate">{chunk.docName}</span>
        </span>
      }
      footer={<p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{FIXED_MEDICAL_DISCLAIMER}</p>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            <FileText className="w-4 h-4 text-teal-600" /> Page {chunk.page}
          </span>
          <span>Source: {chunk.trustedSource}</span>
          <span className="font-mono">{method ? METHOD_LABEL[method] : 'Match'}: {(score * 100).toFixed(0)}%</span>
          {rerankScore !== undefined && <span className="font-mono">Rerank: {rerankScore}/10</span>}
        </div>

        <div>
          <span className="kicker">Verified source excerpt ({chunk.wordCount} words)</span>
          <div className="mt-2 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border-[1.5px] border-slate-200 dark:border-slate-700 text-base md:text-sm leading-relaxed whitespace-pre-wrap">
            {chunk.text}
          </div>
        </div>

        {chunk.url && (
          <a href={chunk.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm w-full sm:w-auto">
            <ExternalLink className="w-4 h-4" />
            <span>Open the full page on MedlinePlus</span>
          </a>
        )}

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="break-all">
            Retrieved from the local knowledge base{chunk.embeddingModel ? ` (${chunk.embeddingModel})` : ''} - {chunk.id.slice(0, 28)}
          </span>
        </div>
      </div>
    </Sheet>
  );
};
