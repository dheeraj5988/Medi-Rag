import React, { useEffect, useState } from 'react';
import { FlaskConical, Activity, CheckCircle2, XCircle, Play, RotateCw, BarChart3, Plus, Trash2 } from 'lucide-react';
import {
  ConnectionTestResult,
  RetrievalBenchmarkItem,
  QualityBenchmarkItem,
  ModelComparisonResult,
  MLMetrics,
} from '../types';
import { testConnection, generateContent, simulateError, fetchHealth, callCounter } from '../lib/gemini/client';
import { retrievePassages } from '../lib/rag/pipeline';
import { GROUNDEDNESS_EVALUATION_SCHEMA } from '../prompts';
import { parseSymptomCSV, trainAndEvaluateClassifier, SAMPLE_SYMPTOMS_CSV } from '../lib/ml/naiveBayes';
import { loadSymptomModel, rankDiseases, SymptomModelFile } from '../lib/ml/symptomModel';
import { runAllUnitTests, UnitTestResult } from '../lib/rag/unitTests';
import { AVAILABLE_GENERATION_MODELS } from '../constants';

interface TestLabScreenProps {
  generationModel: string;
  embeddingModel: string;
}

type TabId = 'connection' | 'retrieval' | 'symptoms' | 'quality' | 'compare' | 'unittests' | 'errors';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'connection', label: 'Connection' },
  { id: 'retrieval', label: 'Retrieval' },
  { id: 'symptoms', label: 'Symptom model' },
  { id: 'quality', label: 'Groundedness' },
  { id: 'compare', label: 'Compare models' },
  { id: 'unittests', label: 'Unit tests' },
  { id: 'errors', label: 'Errors and usage' },
];

const Pill: React.FC<{ ok: boolean; yes?: string; no?: string }> = ({ ok, yes = 'PASS', no = 'FAIL' }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full border-[1.5px] text-xs font-extrabold ${ok ? 'bg-lime-400 text-slate-900 border-slate-900' : 'bg-rose-100 text-rose-900 border-rose-700'}`}>
    {ok ? yes : no}
  </span>
);

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{label}</span>
    <p className="text-2xl font-extrabold font-mono">{value}</p>
  </div>
);

/** Known cases for the production symptom model, with checks that were verified against the exported model. */
const SYMPTOM_CHECKS: Array<{ name: string; symptoms: string[]; expect: { disease: string; within: 1 | 3 } | { contains: string; within: 3 } }> = [
  { name: 'Dengue-like (fever, headache, body pain, rash, pain behind eyes)', symptoms: ['high_fever', 'headache', 'muscle_pain', 'skin_rash', 'pain_behind_the_eyes'], expect: { disease: 'Dengue', within: 1 } },
  { name: 'Cold-like (cough, fever, runny nose, sore throat)', symptoms: ['cough', 'high_fever', 'runny_nose', 'throat_irritation'], expect: { disease: 'Common cold', within: 1 } },
  { name: 'Urinary (burning, bladder discomfort, foul smell)', symptoms: ['burning_micturition', 'bladder_discomfort', 'foul_smell_of_urine'], expect: { disease: 'Urinary tract infection', within: 1 } },
  { name: 'Cardiac (chest pain, breathlessness, sweating)', symptoms: ['chest_pain', 'breathlessness', 'sweating'], expect: { disease: 'Heart attack', within: 3 } },
  { name: 'Liver-like (yellow eyes, dark urine, no appetite, fatigue)', symptoms: ['yellowing_of_eyes', 'dark_urine', 'loss_of_appetite', 'fatigue'], expect: { contains: 'Hepatitis', within: 3 } },
  { name: 'Only two symptoms (fever, body pain): Dengue should still be in the top 3', symptoms: ['high_fever', 'muscle_pain'], expect: { disease: 'Dengue', within: 3 } },
];

const DEFAULT_RETRIEVAL_CASES: RetrievalBenchmarkItem[] = [
  { id: 'r1', query: 'How is dengue spread?', expectedKeywords: ['mosquito'], expectedSource: 'dengue' },
  { id: 'r2', query: 'What are the symptoms of malaria?', expectedKeywords: ['fever'], expectedSource: 'malaria' },
  { id: 'r3', query: 'How does tuberculosis spread?', expectedKeywords: ['air'], expectedSource: 'tuberculosis' },
  { id: 'r4', query: 'What causes a heart attack?', expectedKeywords: ['blood'], expectedSource: 'heart attack' },
  { id: 'r5', query: 'What are the symptoms of a migraine?', expectedKeywords: ['headache'], expectedSource: 'migraine' },
  { id: 'r6', query: 'How is hepatitis B spread?', expectedKeywords: ['blood'], expectedSource: 'hepatitis b' },
  { id: 'r7', query: 'What causes high blood pressure?', expectedKeywords: ['blood pressure'], expectedSource: 'high blood pressure' },
  { id: 'r8', query: 'What is the difference between type 1 and type 2 diabetes?', expectedKeywords: ['type 2'], expectedSource: 'diabetes' },
  { id: 'r9', query: 'What are the symptoms of a urinary tract infection?', expectedKeywords: ['urin'], expectedSource: 'urinary tract' },
  { id: 'r10', query: 'How is the common cold treated?', expectedKeywords: ['cold'], expectedSource: 'common cold' },
  { id: 'r11', query: 'What is chickenpox?', expectedKeywords: ['rash'], expectedSource: 'chickenpox' },
  { id: 'r12', query: 'What are the symptoms of hypothyroidism?', expectedKeywords: ['thyroid'], expectedSource: 'hypothyroidism' },
];

export const TestLabScreen: React.FC<TestLabScreenProps> = ({ generationModel, embeddingModel }) => {
  const [activeTab, setActiveTab] = useState<TabId>('connection');
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // 1. Connection
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);

  // 2. Retrieval
  const [retrievalCases, setRetrievalCases] = useState<RetrievalBenchmarkItem[]>(DEFAULT_RETRIEVAL_CASES);
  const [runningRetrievalTest, setRunningRetrievalTest] = useState(false);
  const [retrievalSummary, setRetrievalSummary] = useState<{ doc: number; hit1: number; hitK: number } | null>(null);
  const [newQuery, setNewQuery] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newSource, setNewSource] = useState('');

  // 3. Symptom model
  const [symModel, setSymModel] = useState<SymptomModelFile | null>(null);
  const [evalData, setEvalData] = useState<{ method: string; caveat: string; robustness: Array<{ symptoms_reported: number; samples: number; top1: number; top3: number }> } | null>(null);
  const [csvInput, setCsvInput] = useState(SAMPLE_SYMPTOMS_CSV);
  const [mlMetrics, setMlMetrics] = useState<MLMetrics | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);
  const [symChecksRan, setSymChecksRan] = useState(false);

  // 4. Quality
  const [qualityCases, setQualityCases] = useState<QualityBenchmarkItem[]>([
    { id: 'q-1', query: 'How does dengue spread, and what are its warning signs?' },
    { id: 'q-2', query: 'What are the symptoms of malaria?' },
  ]);
  const [runningQualityTest, setRunningQualityTest] = useState(false);

  // 5. Compare
  const [compareQuery, setCompareQuery] = useState('What should someone with dengue watch for after the fever goes away?');
  const [selectedCompareModels, setSelectedCompareModels] = useState<string[]>(['gemini-3.8-flash', 'gemini-3.1-flash-lite']);
  const [compareResults, setCompareResults] = useState<ModelComparisonResult[]>([]);
  const [runningCompare, setRunningCompare] = useState(false);

  // 6/7. Unit tests, errors
  const [unitTestResults, setUnitTestResults] = useState<UnitTestResult[]>([]);
  const [simulatedErrorResult, setSimulatedErrorResult] = useState<string | null>(null);
  const [lastCalls, setLastCalls] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetchHealth().then((h) => setHasKey(h.hasApiKey));
    loadSymptomModel().then(setSymModel).catch(() => undefined);
    fetch('/model/symptom_model_eval.json').then((r) => (r.ok ? r.json() : null)).then(setEvalData).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeTab === 'errors') {
      try {
        const raw = localStorage.getItem('medi_rag_last_analysis_calls');
        setLastCalls(raw ? JSON.parse(raw) : null);
      } catch {
        setLastCalls(null);
      }
    }
  }, [activeTab]);

  const needsKeyNote = hasKey === false && (
    <div className="p-3 rounded-xl border-[1.5px] border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm">
      No Gemini key is configured on the server, so this test cannot run. Add <code>GEMINI_API_KEY</code> to <code>.env</code> and restart.
    </div>
  );

  // ----- handlers
  const handleRunConnectionTest = async () => {
    setTestingConnection(true);
    try {
      setConnectionResult(await testConnection(generationModel, embeddingModel));
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunRetrievalBenchmark = async () => {
    setRunningRetrievalTest(true);
    let doc = 0;
    let hit1 = 0;
    let hitK = 0;
    const updated: RetrievalBenchmarkItem[] = [];
    for (const item of retrievalCases) {
      const results = await retrievePassages(item.query, { embeddingModel, topK: 5, similarityThreshold: 0.25 });
      const top1 = results[0]?.chunk.text.toLowerCase() || '';
      const allText = results.map((r) => r.chunk.text.toLowerCase()).join(' ');
      const docHitAt1 = item.expectedSource ? (results[0]?.chunk.docName.toLowerCase().includes(item.expectedSource.toLowerCase()) ?? false) : false;
      const hitAt1 = item.expectedKeywords.some((kw) => top1.includes(kw.toLowerCase()));
      const hitAtK = item.expectedKeywords.some((kw) => allText.includes(kw.toLowerCase()));
      if (docHitAt1) doc++;
      if (hitAt1) hit1++;
      if (hitAtK) hitK++;
      updated.push({ ...item, results, docHitAt1, hitAt1, hitAtK, avgScore: results[0]?.score || 0 });
    }
    const n = retrievalCases.length || 1;
    setRetrievalCases(updated);
    setRetrievalSummary({ doc: doc / n, hit1: hit1 / n, hitK: hitK / n });
    setRunningRetrievalTest(false);
  };

  const addRetrievalCase = () => {
    if (!newQuery.trim()) return;
    setRetrievalCases((prev) => [
      ...prev,
      {
        id: `r-${Date.now()}`,
        query: newQuery.trim(),
        expectedKeywords: newKeywords.split(',').map((k) => k.trim()).filter(Boolean),
        expectedSource: newSource.trim() || undefined,
      },
    ]);
    setNewQuery('');
    setNewKeywords('');
    setNewSource('');
  };

  const handleRunQualityBenchmark = async () => {
    setRunningQualityTest(true);
    const updated: QualityBenchmarkItem[] = [];
    for (const q of qualityCases) {
      const sources = await retrievePassages(q.query, { embeddingModel, topK: 3, similarityThreshold: 0.25 });
      const context = sources.map((s, i) => `[Passage ${i + 1}]: ${s.chunk.text}`).join('\n\n');
      const genRes = await generateContent({
        model: generationModel,
        contents: `Context:\n${context}\n\nQuestion: ${q.query}\n\nAnswer ONLY from the context with [1], [2] citations.`,
      });
      const answer = genRes.text || genRes.error || 'Failed to generate answer';

      let score: number | undefined;
      let supportedClaims: string[] = [];
      let unsupportedClaims: string[] = [];
      if (genRes.success) {
        const evalRes = await generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `You are a medical groundedness auditor. Judge the answer against the passages.\nPassages:\n${context}\n\nAnswer:\n${answer}\n\nReturn a groundedness score 0-1, supported claims and unsupported claims.`,
          responseMimeType: 'application/json',
          responseSchema: GROUNDEDNESS_EVALUATION_SCHEMA,
        });
        if (evalRes.success) {
          try {
            const parsed = JSON.parse(evalRes.text);
            score = parsed.score;
            supportedClaims = parsed.supportedClaims || [];
            unsupportedClaims = parsed.unsupportedClaims || [];
          } catch {
            // leave score undefined
          }
        }
      }
      updated.push({ ...q, answer, sources, groundednessScore: score, supportedClaims, unsupportedClaims });
    }
    setQualityCases(updated);
    setRunningQualityTest(false);
  };

  const handleRunModelComparison = async () => {
    if (selectedCompareModels.length === 0) return;
    setRunningCompare(true);
    setCompareResults([]);
    const sources = await retrievePassages(compareQuery, { embeddingModel, topK: 3, similarityThreshold: 0.25 });
    const prompt = `Context:\n${sources.map((s, i) => `[Passage ${i + 1}]: ${s.chunk.text}`).join('\n\n')}\n\nQuestion: ${compareQuery}\n\nAnswer from the context with bracketed citations.`;
    const results: ModelComparisonResult[] = [];
    for (const model of selectedCompareModels) {
      const start = Date.now();
      const res = await generateContent({ model, contents: prompt });
      results.push({
        model: res.success ? res.modelUsed : model,
        answer: res.text || '',
        latency: Date.now() - start,
        citationCount: (res.text?.match(/\[\d+\]/g) || []).length,
        error: res.error,
      });
    }
    setCompareResults(results);
    setRunningCompare(false);
  };

  const handleTrainClassifier = () => {
    setMlError(null);
    try {
      setMlMetrics(trainAndEvaluateClassifier(parseSymptomCSV(csvInput)));
    } catch (err: unknown) {
      setMlError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSimulateError = async (type: '429' | '503') => {
    setSimulatedErrorResult('Simulating...');
    const res = await simulateError(type);
    setSimulatedErrorResult(`Simulated ${type}: [${res.code}] ${res.error}`);
  };

  const symptomCheckResults = symModel
    ? SYMPTOM_CHECKS.map((c) => {
        const top = rankDiseases(symModel, c.symptoms, 3);
        const names = top.map((t) => t.disease);
        const ok = 'disease' in c.expect
          ? names.slice(0, c.expect.within).includes(c.expect.disease)
          : names.slice(0, c.expect.within).some((n) => n.includes((c.expect as { contains: string }).contains));
        return { ...c, top, ok };
      })
    : [];

  const runBtn = (label: string, onClick: () => void, running: boolean, disabled = false) => (
    <button onClick={onClick} disabled={running || disabled} className="btn btn-primary self-start">
      {running ? <RotateCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
      <span>{running ? 'Running...' : label}</span>
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 md:py-8 space-y-5">
      <div>
        <span className="kicker">Trust, but verify</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-[1.05] mt-1 flex items-center gap-2">
          <FlaskConical className="w-8 h-8 text-teal-600 shrink-0" aria-hidden="true" />
          <span>Test lab</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-2xl">
          Check the connection, the symptom model, retrieval quality, groundedness and error handling. Checks marked free need no Gemini key.
        </p>
      </div>

      {/* Tabs: scroll sideways on phones */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 snap-x" role="tablist" aria-label="Test sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={activeTab === t.id} aria-pressed={activeTab === t.id} onClick={() => setActiveTab(t.id)} className="chip snap-start shrink-0 whitespace-nowrap">
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. Connection */}
      {activeTab === 'connection' && (
        <section className="card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-xl font-extrabold">Gemini connection</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Sends one tiny real request to the writing model and one to the embedding model.</p>
          </div>
          <p className="text-sm">Server key: {hasKey === null ? '...' : <Pill ok={hasKey} yes="SET" no="NOT SET" />}</p>
          {needsKeyNote}
          {runBtn('Run connection test', handleRunConnectionTest, testingConnection, hasKey === false)}

          {connectionResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {[
                { title: 'Writing model', pass: connectionResult.generationPass, target: generationModel, answered: connectionResult.generationModel, ms: connectionResult.generationLatency },
                { title: 'Embedding model', pass: connectionResult.embeddingPass, target: embeddingModel, answered: connectionResult.embeddingModel, ms: connectionResult.embeddingLatency },
              ].map((r) => (
                <div key={r.title} className={`p-4 rounded-2xl border-[1.5px] ${r.pass ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold">{r.title}</span>
                    <Pill ok={r.pass} />
                  </div>
                  <p className="text-sm">Target: <span className="font-mono font-bold">{r.target}</span></p>
                  <p className="text-sm">Answered by: <span className="font-mono">{r.answered}</span></p>
                  <p className="text-sm">Latency: <span className="font-mono font-bold">{r.ms} ms</span></p>
                </div>
              ))}
            </div>
          )}
          {connectionResult?.error && <div className="p-3 rounded-xl bg-rose-50 border-[1.5px] border-rose-400 text-rose-800 text-sm"><b>Details:</b> {connectionResult.error}</div>}
        </section>
      )}

      {/* 2. Retrieval */}
      {activeTab === 'retrieval' && (
        <section className="card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-xl font-extrabold">Retrieval benchmark <span className="text-xs font-bold text-teal-700 dark:text-teal-300 align-middle">free with keyword search</span></h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              For each question: does the best passage come from the right document (<b>document hit</b>), and does it contain an expected keyword (<b>hit@1</b>, or anywhere in the top 5: <b>hit@k</b>)?
            </p>
          </div>
          {runBtn('Run retrieval benchmark', handleRunRetrievalBenchmark, runningRetrievalTest)}

          {retrievalSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Stat label="Document hit" value={`${(retrievalSummary.doc * 100).toFixed(0)}%`} />
              <Stat label="Hit@1" value={`${(retrievalSummary.hit1 * 100).toFixed(0)}%`} />
              <Stat label="Hit@k" value={`${(retrievalSummary.hitK * 100).toFixed(0)}%`} />
              <Stat label="Questions" value={retrievalCases.length} />
            </div>
          )}

          <table className="rtable text-sm md:text-left">
            <thead className="hidden md:table-header-group text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
              <tr><th className="p-3">Question</th><th className="p-3">Expected</th><th className="p-3">Top match</th><th className="p-3">Doc</th><th className="p-3">Hit@1</th><th className="p-3">Hit@k</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {retrievalCases.map((item) => (
                <tr key={item.id} className="md:border-b md:border-slate-200 md:dark:border-slate-800">
                  <td data-label="Question" className="md:p-3 font-bold md:max-w-xs">{item.query}</td>
                  <td data-label="Expected" className="md:p-3 text-xs font-mono">{item.expectedSource ? `${item.expectedSource}: ` : ''}{item.expectedKeywords.join(', ')}</td>
                  <td data-label="Top match" className="md:p-3 text-xs">{item.results?.[0] ? `${item.results[0].chunk.docName} (${item.results[0].method === 'vector' ? 'semantic' : 'keyword'}, ${(item.results[0].score * 100).toFixed(0)}%)` : '-'}</td>
                  <td data-label="Doc" className="md:p-3">{item.docHitAt1 === undefined ? '-' : <Pill ok={item.docHitAt1} yes="HIT" no="MISS" />}</td>
                  <td data-label="Hit@1" className="md:p-3">{item.hitAt1 === undefined ? '-' : <Pill ok={item.hitAt1} yes="HIT" no="MISS" />}</td>
                  <td data-label="Hit@k" className="md:p-3">{item.hitAtK === undefined ? '-' : <Pill ok={item.hitAtK} yes="HIT" no="MISS" />}</td>
                  <td data-label="" className="md:p-3">
                    <button className="btn btn-ghost btn-sm" aria-label="Remove question" onClick={() => setRetrievalCases((prev) => prev.filter((c) => c.id !== item.id))}><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className="group">
            <summary className="cursor-pointer font-bold text-sm select-none">Add a question</summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="field" placeholder="Question" value={newQuery} onChange={(e) => setNewQuery(e.target.value)} aria-label="Question" />
              <input className="field" placeholder="Expected keywords (comma separated)" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} aria-label="Expected keywords" />
              <input className="field" placeholder="Expected document title contains..." value={newSource} onChange={(e) => setNewSource(e.target.value)} aria-label="Expected document" />
            </div>
            <button className="btn btn-sm mt-3" onClick={addRetrievalCase}><Plus className="w-4 h-4" /><span>Add</span></button>
          </details>
        </section>
      )}

      {/* 3. Symptom model */}
      {activeTab === 'symptoms' && (
        <div className="space-y-5">
          <section className="card p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-xl font-extrabold">Production symptom model <span className="text-xs font-bold text-teal-700 dark:text-teal-300 align-middle">free</span></h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Naive Bayes over {symModel ? symModel.symptoms.length : '...'} symptoms and {symModel ? symModel.diseases.length : '...'} diseases from a public dataset.
              </p>
            </div>

            <div className="p-3 rounded-xl border-[1.5px] border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-sm text-amber-900 dark:text-amber-200">
              <b>Read before quoting accuracy.</b> {evalData?.caveat || 'The dataset is synthetic.'} The table below is the honest guide: accuracy when only some symptoms are reported.
            </div>

            {evalData && (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-300">{evalData.method}</p>
                <table className="rtable text-sm md:text-left">
                  <thead className="hidden md:table-header-group text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
                    <tr><th className="p-3">Symptoms reported</th><th className="p-3">Right disease first</th><th className="p-3">Right disease in top 3</th><th className="p-3">Test samples</th></tr>
                  </thead>
                  <tbody>
                    {evalData.robustness.map((r) => (
                      <tr key={r.symptoms_reported} className="md:border-b md:border-slate-200 md:dark:border-slate-800">
                        <td data-label="Symptoms reported" className="md:p-3 font-extrabold">{r.symptoms_reported}</td>
                        <td data-label="First" className="md:p-3 font-mono font-bold">{(r.top1 * 100).toFixed(1)}%</td>
                        <td data-label="Top 3" className="md:p-3 font-mono font-bold">{(r.top3 * 100).toFixed(1)}%</td>
                        <td data-label="Samples" className="md:p-3 font-mono">{r.samples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="card p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-xl font-extrabold">Live checks on the shipped model</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Runs the real scoring code in your browser on known symptom sets.</p>
            </div>
            {runBtn('Run live checks', () => setSymChecksRan(true), false, !symModel)}
            {symChecksRan && (
              <ul className="space-y-3">
                {symptomCheckResults.map((r) => (
                  <li key={r.name} className="p-3 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-bold text-sm">{r.name}</span>
                      <Pill ok={r.ok} />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Expected {'disease' in r.expect ? r.expect.disease : `a ${r.expect.contains} condition`} in the top {r.expect.within}.
                    </p>
                    <div className="text-sm">{r.top.map((t) => `${t.disease} (${(t.strength * 100).toFixed(0)}%)`).join(' · ')}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-xl font-extrabold">Train a classifier on your own CSV</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Bernoulli Naive Bayes, 80/20 split of <b>unique</b> rows with a seeded shuffle (reproducible). Columns of 0/1 symptoms plus a <code>prognosis</code> column.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="label !mb-0" htmlFor="csv">CSV data</label>
              <button onClick={() => setCsvInput(SAMPLE_SYMPTOMS_CSV)} className="btn btn-ghost btn-sm">Reset to the 25-row sample</button>
            </div>
            <textarea id="csv" rows={6} value={csvInput} onChange={(e) => setCsvInput(e.target.value)} className="field font-mono !text-xs" />
            <button onClick={handleTrainClassifier} className="btn btn-primary self-start"><BarChart3 className="w-4 h-4" /><span>Train and evaluate</span></button>
            {mlError && <div className="p-3 bg-rose-50 text-rose-800 rounded-xl text-sm border-[1.5px] border-rose-400">{mlError}</div>}

            {mlMetrics && (
              <div className="space-y-5 pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
                  <Stat label="Test accuracy" value={`${(mlMetrics.accuracy * 100).toFixed(1)}%`} />
                  <Stat label="Test rows" value={mlMetrics.sampleCount} />
                  <Stat label="Unique / total" value={`${mlMetrics.uniqueRows}/${mlMetrics.totalRows}`} />
                  <Stat label="Classes" value={mlMetrics.classes.length} />
                </div>
                {mlMetrics.sampleCount < 20 && <p className="text-sm text-amber-800 dark:text-amber-300 font-semibold">Only {mlMetrics.sampleCount} test rows: this accuracy is very noisy.</p>}

                <div>
                  <h3 className="font-extrabold mb-2">Per-class metrics</h3>
                  <table className="rtable text-sm md:text-left">
                    <thead className="hidden md:table-header-group text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
                      <tr><th className="p-2.5">Class</th><th className="p-2.5">Precision</th><th className="p-2.5">Recall</th><th className="p-2.5">F1</th></tr>
                    </thead>
                    <tbody>
                      {mlMetrics.classes.map((c) => (
                        <tr key={c} className="md:border-b md:border-slate-200 md:dark:border-slate-800">
                          <td data-label="Class" className="md:p-2.5 font-bold">{c}</td>
                          <td data-label="Precision" className="md:p-2.5 font-mono">{(mlMetrics.precision[c] * 100).toFixed(1)}%</td>
                          <td data-label="Recall" className="md:p-2.5 font-mono">{(mlMetrics.recall[c] * 100).toFixed(1)}%</td>
                          <td data-label="F1" className="md:p-2.5 font-mono font-bold">{mlMetrics.f1[c].toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="font-extrabold mb-1">Confusion matrix</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Rows = actual, columns = predicted. Scroll sideways if needed.</p>
                  <div className="overflow-x-auto p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border-[1.5px] border-slate-200 dark:border-slate-700" tabIndex={0} aria-label="Confusion matrix, scrollable">
                    <table className="text-xs text-center border-collapse">
                      <thead>
                        <tr>
                          <th className="p-2 text-left font-normal text-slate-500">Actual \ Pred</th>
                          {mlMetrics.classes.map((c) => <th key={c} className="p-2 font-mono truncate max-w-[90px]">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {mlMetrics.classes.map((actual, row) => (
                          <tr key={actual}>
                            <td className="p-2 font-bold text-left truncate max-w-[120px]">{actual}</td>
                            {mlMetrics.confusionMatrix[row].map((v, col) => (
                              <td key={col} className={`p-2.5 border border-white dark:border-slate-900 font-mono ${v === 0 ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : row === col ? 'bg-teal-600 text-white font-bold' : 'bg-rose-500 text-white font-bold'}`}>{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* 4. Groundedness */}
      {activeTab === 'quality' && (
        <section className="card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-xl font-extrabold">Groundedness audit</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Writes an answer from the retrieved passages, then asks a second Gemini call to check each claim. This is an AI-based estimate. Uses about 2 requests per question.</p>
          </div>
          {needsKeyNote}
          {runBtn('Run groundedness audit', handleRunQualityBenchmark, runningQualityTest, hasKey === false)}
          <div className="space-y-4">
            {qualityCases.map((q, idx) => (
              <div key={q.id} className="p-4 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="font-bold text-sm">#{idx + 1} {q.query}</h3>
                  {q.groundednessScore !== undefined && <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-full bg-lime-400 text-slate-900 border border-slate-900 self-start">Groundedness {(q.groundednessScore * 100).toFixed(0)}% (AI estimate)</span>}
                </div>
                {q.answer && <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm leading-relaxed whitespace-pre-wrap">{q.answer}</div>}
                {q.supportedClaims && q.supportedClaims.length > 0 && (
                  <div className="text-sm"><b className="text-emerald-700 dark:text-emerald-400">Supported ({q.supportedClaims.length})</b><ul className="list-disc pl-5 mt-1">{q.supportedClaims.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
                )}
                {q.unsupportedClaims && q.unsupportedClaims.length > 0 && (
                  <div className="text-sm"><b className="text-rose-700 dark:text-rose-400">Unsupported ({q.unsupportedClaims.length})</b><ul className="list-disc pl-5 mt-1">{q.unsupportedClaims.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Compare */}
      {activeTab === 'compare' && (
        <section className="card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-xl font-extrabold">Compare models</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Same question and same retrieved passages for each selected model: style, citation count and latency.</p>
          </div>
          {needsKeyNote}
          <div>
            <label className="label" htmlFor="cmp-q">Question</label>
            <input id="cmp-q" type="text" value={compareQuery} onChange={(e) => setCompareQuery(e.target.value)} className="field" />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Models to compare">
            {AVAILABLE_GENERATION_MODELS.map((m) => {
              const on = selectedCompareModels.includes(m.id);
              return (
                <button key={m.id} type="button" className="chip" aria-pressed={on} onClick={() => setSelectedCompareModels((prev) => (on ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}>
                  {m.name.split(' (')[0]}
                </button>
              );
            })}
          </div>
          {runBtn('Run comparison', handleRunModelComparison, runningCompare, selectedCompareModels.length === 0 || hasKey === false)}

          {compareResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {compareResults.map((res, i) => (
                <div key={`${res.model}-${i}`} className="p-4 rounded-2xl border-[1.5px] border-slate-300 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold font-mono text-sm break-all">{res.model}</span>
                    <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-full bg-lime-400 text-slate-900 border border-slate-900 shrink-0">{res.latency} ms</span>
                  </div>
                  <p className="text-xs font-mono">Citations: {res.citationCount}</p>
                  <div className={`text-sm leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto p-2.5 rounded-xl ${res.error ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 dark:bg-slate-800'}`}>{res.answer || res.error}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 6. Unit tests */}
      {activeTab === 'unittests' && (
        <section className="card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-xl font-extrabold">Unit tests <span className="text-xs font-bold text-teal-700 dark:text-teal-300 align-middle">free</span></h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Cleaner, chunker, cosine and L2 maths, red flags, seeded shuffle, de-duplication, symptom ranking, symptom extraction, BM25 retrieval, Naive Bayes.</p>
          </div>
          <button onClick={() => setUnitTestResults(runAllUnitTests())} className="btn btn-primary self-start"><Play className="w-4 h-4" /><span>Run unit tests</span></button>
          {unitTestResults.length > 0 && (
            <>
              <p className="text-sm font-extrabold">{unitTestResults.filter((t) => t.passed).length} of {unitTestResults.length} passed</p>
              <ul className="space-y-2">
                {unitTestResults.map((t, idx) => (
                  <li key={idx} className={`p-3 rounded-2xl border-[1.5px] text-sm flex items-start justify-between gap-3 ${t.passed ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-rose-500 bg-rose-50 dark:bg-rose-950/20'}`}>
                    <div className="flex items-start gap-2.5 min-w-0">
                      {t.passed ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                      <div className="min-w-0">
                        <p><b>{t.name}</b> <span className="text-slate-500">({t.category})</span></p>
                        <p className="text-slate-700 dark:text-slate-300 mt-0.5">{t.message}</p>
                        {t.details && <p className="font-mono text-xs text-slate-500 mt-0.5 break-words">{t.details}</p>}
                      </div>
                    </div>
                    <Pill ok={t.passed} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* 7. Errors and usage */}
      {activeTab === 'errors' && (
        <div className="space-y-5">
          <section className="card p-4 sm:p-6 space-y-3">
            <h2 className="text-xl font-extrabold">Gemini requests per analysis</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Counted for the last Symptom Checker analysis in this browser. The goal is at most 2: one to understand free text, one to write the explanation.</p>
            {lastCalls ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
                <Stat label="Total" value={lastCalls.total ?? 0} />
                <Stat label="Generate" value={lastCalls.generate ?? 0} />
                <Stat label="Embed" value={lastCalls.embed ?? 0} />
                <Stat label="Rerank" value={lastCalls.rerank ?? 0} />
                <Stat label="Stream" value={lastCalls.stream ?? 0} />
              </div>
            ) : (
              <p className="text-sm">No analysis recorded yet. Run one in the Check tab (needs a Gemini key to count requests).</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">Requests made in this session so far: {callCounter.total}</p>
          </section>

          <section className="card p-4 sm:p-6 space-y-3">
            <h2 className="text-xl font-extrabold">Error and fallback messages <span className="text-xs font-bold text-teal-700 dark:text-teal-300 align-middle">free</span></h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Shows how the app words a 429 (quota) and a 503 (overload). Makes no Gemini request.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => handleSimulateError('429')} className="btn">Simulate 429 (quota)</button>
              <button onClick={() => handleSimulateError('503')} className="btn">Simulate 503 (overloaded)</button>
            </div>
            {simulatedErrorResult && <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-mono break-words">{simulatedErrorResult}</div>}
          </section>
        </div>
      )}
    </div>
  );
};
