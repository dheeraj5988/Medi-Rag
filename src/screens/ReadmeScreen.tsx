import React from 'react';
import { FileCode, CheckCircle2, Shield, ArrowUpRight, Cpu, HardDrive } from 'lucide-react';

export const ReadmeScreen: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <FileCode className="w-5 h-5 text-teal-600" />
          <span>Technical Architecture & Implementation README</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Engineering design notes, anti-hallucination guardrails, and roadmap extension guides for production deployments.
        </p>
      </div>

      {/* What Was Built */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          1. System Overview & What Was Built
        </h2>
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2.5 leading-relaxed">
          <p>
            <strong>Medi-RAG</strong> is a full-stack educational medical decision-support assistant that combines client-side IndexedDB vector retrieval, structured symptom entity extraction, red-flag emergency detection, and Google Gemini LLMs with source citations.
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>
              <strong>Conversational Streaming RAG:</strong> Real-time Server-Sent Events (SSE) streaming answers from Gemini with bracketed citations [1], [2] that link directly to exact retrieved passages, page numbers, and cosine similarity scores.
            </li>
            <li>
              <strong>Structured Symptom Checker:</strong> Extracts normalized entities via Gemini structured JSON schemas, calculates condition probabilities, retrieves trusted passages per condition, and provides printable patient reports.
            </li>
            <li>
              <strong>Client-Side Vector Engine:</strong> Ingests PDF/TXT/MD documents using browser <code className="font-mono text-teal-700 dark:text-teal-400">pdfjs-dist</code>, chunks them into ~300-word blocks with 40-word overlap, and embeds them into IndexedDB via <code className="font-mono text-teal-700 dark:text-teal-400">gemini-embedding-2</code>.
            </li>
            <li>
              <strong>Comprehensive Test Lab:</strong> Live connection diagnostics, retrieval keyword hit-rate benchmarks (hit@1, hit@k), AI-groundedness audits, side-by-side model comparisons, in-browser Naive Bayes classifier baseline, and unit test runner.
            </li>
          </ul>
        </div>
      </div>

      {/* Key Design Decisions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          2. Key Engineering & Clinical UX Decisions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-bold text-teal-700 dark:text-teal-400">Local Vector Isolation</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
              No user documents, text chunks, or embedding vectors are stored on any cloud server or third-party database. All vectors persist in the browser's IndexedDB, ensuring complete patient document privacy.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-bold text-teal-700 dark:text-teal-400">No Aggregation Bug in Embeddings</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
              When calling <code className="font-mono">gemini-embedding-2</code>, multi-part strings can accidentally return an aggregated single vector. Medi-RAG embeds each chunk distinctly and strictly asserts <code className="font-mono">embeddings.length === chunks.length</code>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-bold text-teal-700 dark:text-teal-400">Automated Flash Fallback Hierarchy</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
              If the primary model (<code className="font-mono">gemini-3.8-flash</code>) encounters a 429 quota or 503 overload event, requests automatically fall back to <code className="font-mono">gemini-3.1-flash-lite</code> without crashing.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <h3 className="font-bold text-teal-700 dark:text-teal-400">Immediate Red-Flag Interception</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
              Life-threatening phrases (e.g. chest pain, severe shortness of breath, FAST stroke signs) trigger an unmissable red alert banner with direct telephone emergency links before any AI generation.
            </p>
          </div>
        </div>
      </div>

      {/* How to Extend */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          3. Production Roadmap & How to Extend
        </h2>
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="border-l-2 border-teal-500 pl-3 py-0.5 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white">
              A. Cloud Vector Database Integration (Pinecone, pgvector, or Milvus)
            </h3>
            <p className="text-[11px] leading-relaxed">
              To scale beyond personal browser storage to enterprise institutional guidelines with millions of chunks, replace <code className="font-mono">src/lib/rag/db.ts</code> with a server-side pgvector or Pinecone adapter while preserving the exact <code className="font-mono">rankChunks</code> and <code className="font-mono">retrievePassages</code> contract.
            </p>
          </div>

          <div className="border-l-2 border-teal-500 pl-3 py-0.5 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white">
              B. Scanned Document OCR (Tesseract.js / Gemini Vision)
            </h3>
            <p className="text-[11px] leading-relaxed">
              Currently, image-only scanned PDFs trigger a warning. Integrating Tesseract.js or sending base64 document page images to Gemini 3.8 Flash multimodal vision will enable optical character recognition of scanned lab reports and physical clinical paperwork.
            </p>
          </div>

          <div className="border-l-2 border-teal-500 pl-3 py-0.5 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white">
              C. EHR & Wearable Biometrics Integration (FHIR / Apple HealthKit)
            </h3>
            <p className="text-[11px] leading-relaxed">
              Connect patient profiles with HL7 FHIR APIs or wearable biometric streams (resting heart rate, SpO2, blood pressure) to enrich the symptom intake pipeline with objective physiological baselines.
            </p>
          </div>

          <div className="border-l-2 border-teal-500 pl-3 py-0.5 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white">
              D. Clinician-in-the-Loop Review Mode
            </h3>
            <p className="text-[11px] leading-relaxed">
              Add a dual-view portal where a registered clinician can review the patient's symptom submission, inspect the retrieved passage excerpts, and append signed physician notes before sharing educational outputs with patients.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
