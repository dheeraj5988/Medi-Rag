import React from 'react';
import {
  Info,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Layers,
  Database,
  Search,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { FIXED_MEDICAL_DISCLAIMER } from '../constants';

export const AboutScreen: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Info className="w-5 h-5 text-teal-600" />
          <span>About Medi-RAG & Clinical Safety Architecture</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          A patient-centered decision-support prototype pairing browser-native vector embeddings with verifiable Gemini clinical synthesis.
        </p>
      </div>

      {/* Prominent Medical Disclaimer */}
      <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Mandatory Clinical Decision-Support Disclaimer
          </h2>
        </div>
        <p className="text-xs leading-relaxed font-medium">
          {FIXED_MEDICAL_DISCLAIMER}
        </p>
        <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-300">
          Medi-RAG is strictly an educational decision-support prototype. It does not replace the professional clinical judgment of a licensed physician, physician assistant, or nurse practitioner. If you suspect an emergency (such as acute chest pain, severe shortness of breath, acute stroke signs, or severe bleeding), call 911, 112, 108, or your local emergency number immediately.
        </p>
      </div>

      {/* Architecture Diagram rendered as clean SVG */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-teal-600" />
          <span>End-to-End System Architecture (Browser + Server-side GenAI)</span>
        </h2>

        <div className="overflow-x-auto p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
          <svg
            viewBox="0 0 900 320"
            className="w-full min-w-[700px] h-auto text-slate-800 dark:text-slate-200 select-none"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background grid accents */}
            <defs>
              <linearGradient id="boxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0D9488" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#0D9488" stopOpacity="0.02" />
              </linearGradient>
              <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 8 5 L 0 9 z" fill="#0D9488" />
              </marker>
            </defs>

            {/* Block 1: User & Symptoms */}
            <rect x="20" y="40" width="140" height="90" rx="8" fill="#F8FAFC" stroke="#0D9488" strokeWidth="2" />
            <text x="90" y="70" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#0F766E">1. Patient Query</text>
            <text x="90" y="90" textAnchor="middle" fontSize="10" fill="#64748B">Symptoms & History</text>
            <text x="90" y="105" textAnchor="middle" fontSize="9" fill="#94A3B8">(Red-Flag Rules)</text>

            {/* Arrow 1 -> 2 */}
            <line x1="160" y1="85" x2="195" y2="85" stroke="#0D9488" strokeWidth="2" markerEnd="url(#arrow)" />

            {/* Block 2: Vector Embedding */}
            <rect x="200" y="40" width="150" height="90" rx="8" fill="#F8FAFC" stroke="#0D9488" strokeWidth="2" />
            <text x="275" y="70" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#0F766E">2. Embedding</text>
            <text x="275" y="90" textAnchor="middle" fontSize="10" fill="#64748B">gemini-embedding-2</text>
            <text x="275" y="105" textAnchor="middle" fontSize="9" fill="#94A3B8">768-dim Auto-normalized</text>

            {/* Arrow 2 -> 3 */}
            <line x1="350" y1="85" x2="385" y2="85" stroke="#0D9488" strokeWidth="2" markerEnd="url(#arrow)" />

            {/* Block 3: IndexedDB Vector Store */}
            <rect x="390" y="30" width="160" height="110" rx="8" fill="#F8FAFC" stroke="#0D9488" strokeWidth="2" />
            <text x="470" y="60" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#0F766E">3. Local IndexedDB</text>
            <text x="470" y="80" textAnchor="middle" fontSize="10" fill="#64748B">Cosine Vector Search</text>
            <text x="470" y="95" textAnchor="middle" fontSize="9" fill="#64748B">Top-K Candidate Chunks</text>
            <text x="470" y="115" textAnchor="middle" fontSize="8" fill="#059669">100% In-Browser Privacy</text>

            {/* Ingestion track below */}
            <rect x="390" y="180" width="160" height="100" rx="8" fill="#F0FDFA" stroke="#14B8A6" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x="470" y="210" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0F766E">Document Ingestion</text>
            <text x="470" y="230" textAnchor="middle" fontSize="9" fill="#64748B">PDF / TXT / Markdown</text>
            <text x="470" y="245" textAnchor="middle" fontSize="9" fill="#64748B">~300-word Chunks + Overlap</text>
            <text x="470" y="260" textAnchor="middle" fontSize="9" fill="#64748B">Verified Source Tagging</text>

            {/* Line connecting ingestion to IndexedDB */}
            <line x1="470" y1="180" x2="470" y2="145" stroke="#14B8A6" strokeWidth="1.5" strokeDasharray="3 3" markerEnd="url(#arrow)" />

            {/* Arrow 3 -> 4 */}
            <line x1="550" y1="85" x2="585" y2="85" stroke="#0D9488" strokeWidth="2" markerEnd="url(#arrow)" />

            {/* Block 4: Gemini LLM */}
            <rect x="590" y="30" width="150" height="110" rx="8" fill="#F8FAFC" stroke="#0D9488" strokeWidth="2" />
            <text x="665" y="60" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#0F766E">4. Gemini Synthesis</text>
            <text x="665" y="80" textAnchor="middle" fontSize="10" fill="#64748B">gemini-3.8-flash</text>
            <text x="665" y="95" textAnchor="middle" fontSize="9" fill="#64748B">Grounded System Rules</text>
            <text x="665" y="110" textAnchor="middle" fontSize="9" fill="#64748B">Automatic 5xx/429 Fallback</text>
            <text x="665" y="125" textAnchor="middle" fontSize="8" fill="#D97706">Optional Re-ranking</text>

            {/* Arrow 4 -> 5 */}
            <line x1="740" y1="85" x2="775" y2="85" stroke="#0D9488" strokeWidth="2" markerEnd="url(#arrow)" />

            {/* Block 5: Verified UI Output */}
            <rect x="780" y="40" width="105" height="90" rx="8" fill="#F8FAFC" stroke="#0D9488" strokeWidth="2" />
            <text x="832" y="65" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0F766E">5. Response</text>
            <text x="832" y="85" textAnchor="middle" fontSize="9" fill="#64748B">SSE Streaming</text>
            <text x="832" y="100" textAnchor="middle" fontSize="9" fill="#0F766E">[1], [2] Citations</text>
            <text x="832" y="115" textAnchor="middle" fontSize="8" fill="#E11D48">Fixed Disclaimer</text>
          </svg>
        </div>
      </div>

      {/* How RAG Works in 5 Steps */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          How Medical Retrieval-Augmented Generation Works in 5 Steps
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <span className="font-bold font-mono text-teal-700 dark:text-teal-400 block">Step 01</span>
            <h3 className="font-bold text-slate-900 dark:text-white">Document Ingestion</h3>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              PDF text is extracted in-browser via pdfjs-dist. Scanned PDF warnings alert the user if OCR text is absent.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <span className="font-bold font-mono text-teal-700 dark:text-teal-400 block">Step 02</span>
            <h3 className="font-bold text-slate-900 dark:text-white">Paragraph Chunking</h3>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Splits text into ~300-word blocks respecting natural paragraph boundaries, carrying over 40 words of overlap.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <span className="font-bold font-mono text-teal-700 dark:text-teal-400 block">Step 03</span>
            <h3 className="font-bold text-slate-900 dark:text-white">Vector Embedding</h3>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Generates normalized 768-dimensional vectors with gemini-embedding-2 in mini-batches to prevent rate limits.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <span className="font-bold font-mono text-teal-700 dark:text-teal-400 block">Step 04</span>
            <h3 className="font-bold text-slate-900 dark:text-white">Cosine Vector Search</h3>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Calculates cosine similarity in TypeScript. Ranks top-k passages with optional Gemini relevance re-ranking.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <span className="font-bold font-mono text-teal-700 dark:text-teal-400 block">Step 05</span>
            <h3 className="font-bold text-slate-900 dark:text-white">Grounded Synthesis</h3>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
              Gemini synthesizes plain-language patient education citing passages [1], [2], refusing if unbacked.
            </p>
          </div>
        </div>
      </div>

      {/* Limitations and Guardrails */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3 text-xs leading-relaxed">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Clinical Guardrails & Known Limitations
        </h2>

        <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400 pl-1">
          <li>
            <strong className="text-slate-900 dark:text-white">Decision-Support Only:</strong> The system is designed strictly to educate and suggest differential patterns. It never asserts "You have X".
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">No Prescription Regimens:</strong> Medi-RAG is strictly instructed never to recommend specific prescription drug dosages or courses.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">Zero Cloud Ingestion Storage:</strong> Patient documents, text chunks, and vector embeddings remain isolated in client IndexedDB storage.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">Automatic Emergency Escalation:</strong> High-risk red-flag symptoms bypass routine text synthesis to surface emergency hotlines immediately.
          </li>
        </ul>
      </div>
    </div>
  );
};
