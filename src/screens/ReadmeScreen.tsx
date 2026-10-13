import React, { useEffect, useState } from 'react';
import { FileCode } from 'lucide-react';

interface EvalFile {
  method: string;
  robustness: Array<{ symptoms_reported: number; samples: number; top1: number; top3: number }>;
  caveat: string;
}

export const ReadmeScreen: React.FC = () => {
  const [evalData, setEvalData] = useState<EvalFile | null>(null);
  useEffect(() => {
    fetch('/model/symptom_model_eval.json').then((r) => (r.ok ? r.json() : null)).then(setEvalData).catch(() => undefined);
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 md:py-8 space-y-6">
      <div>
        <span className="kicker">For developers</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-[1.05] mt-1 flex items-center gap-2">
          <FileCode className="w-8 h-8 text-teal-600 shrink-0" aria-hidden="true" />
          <span>Architecture</span>
        </h1>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="text-2xl font-extrabold">What is built</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
          <li><b>Symptom Checker:</b> symptoms to ids (keyword aliases plus one optional Gemini structured-output call restricted to an enum of valid ids), Naive Bayes shortlist in <code>src/lib/ml/symptomModel.ts</code>, condition-filtered BM25 retrieval, and ONE Gemini synthesis call for all conditions.</li>
          <li><b>Chat RAG:</b> vector search over passages that have vectors, BM25 keyword search over those that do not, optional Gemini re-ranking, streamed answers with [n] citations.</li>
          <li><b>Built-in knowledge base:</b> 209 passages from 40 MedlinePlus pages (public domain), shipped as <code>public/kb/kb_chunks.json</code>, searchable with no API key. Optional precomputed vectors: <code>npm run build-kb</code> writes <code>public/kb/kb_vectors.json</code>.</li>
          <li><b>Server (Express):</b> keeps the Gemini key, per-IP rate limit, input validation, batched one-vector-per-text embeddings, runtime model discovery for fallbacks.</li>
          <li><b>Test Lab:</b> connection probe, retrieval benchmark (right document and keyword hits), groundedness audit, model comparison, symptom-model evaluation, unit tests, error simulation.</li>
        </ul>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-2xl font-extrabold">Symptom model evaluation</h2>
        {evalData ? (
          <>
            <p className="text-sm leading-relaxed">{evalData.method}.</p>
            <table className="rtable text-sm md:text-left">
              <thead className="hidden md:table-header-group text-xs text-slate-600 dark:text-slate-300">
                <tr><th className="py-2">Symptoms reported</th><th>Right disease first</th><th>Right disease in top 3</th><th>Samples</th></tr>
              </thead>
              <tbody>
                {evalData.robustness.map((r) => (
                  <tr key={r.symptoms_reported} className="md:border-b md:border-slate-200 md:dark:border-slate-800">
                    <td data-label="Symptoms reported" className="md:py-2 font-bold">{r.symptoms_reported}</td>
                    <td data-label="First" className="font-mono">{(r.top1 * 100).toFixed(1)}%</td>
                    <td data-label="Top 3" className="font-mono">{(r.top3 * 100).toFixed(1)}%</td>
                    <td data-label="Samples" className="font-mono">{r.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{evalData.caveat}</p>
          </>
        ) : (
          <p className="text-sm">Evaluation file not found (public/model/symptom_model_eval.json).</p>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-2xl font-extrabold">Design decisions</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
          <li><b>ML first, LLM second.</b> Gemini no longer guesses diagnoses. It only explains the model's shortlist from retrieved text.</li>
          <li><b>Few API calls.</b> An analysis uses at most two Gemini requests; retrieval for each predicted condition is local and free. The Test Lab shows the count of the last analysis.</li>
          <li><b>Works with no key.</b> ML shortlist and keyword retrieval are fully local; Gemini features switch on when <code>GEMINI_API_KEY</code> is set.</li>
          <li><b>Embedding gotcha handled.</b> With <code>gemini-embedding-2</code> a plain list of strings yields one merged vector, so each text is its own Content and counts are verified.</li>
          <li><b>429 vs 503.</b> 429 is never retried (retries burn quota) but falls back to another model; 503 falls back too. The list of fallback models comes from <code>ai.models.list()</code>, not a hard-coded list.</li>
          <li><b>Deterministic red flags.</b> Emergency phrases are matched by code before anything else and show a sticky banner.</li>
        </ul>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-2xl font-extrabold">Roadmap</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
          <li>Semantic vectors for the whole built-in library (run <code>npm run build-kb</code> once with a key) and a hybrid BM25 + vector ranker.</li>
          <li>More conditions and more documents (WHO, CDC, NHS) with a clinician-reviewed evaluation set.</li>
          <li>OCR for scanned PDFs, voice input, more languages, clinician review mode, EHR and wearable integration.</li>
        </ul>
      </section>
    </div>
  );
};
