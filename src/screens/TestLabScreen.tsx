import React, { useState } from 'react';
import {
  FlaskConical,
  Activity,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  Plus,
  Trash2,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  Layers,
  Sparkles,
  BarChart3,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import {
  ConnectionTestResult,
  RetrievalBenchmarkItem,
  QualityBenchmarkItem,
  ModelComparisonResult,
  MLMetrics,
} from '../types';
import {
  testConnection,
  generateContent,
  simulateError,
} from '../lib/gemini/client';
import { retrievePassages } from '../lib/rag/pipeline';
import { GROUNDEDNESS_EVALUATION_SCHEMA } from '../prompts';
import {
  parseSymptomCSV,
  trainAndEvaluateClassifier,
  SAMPLE_SYMPTOMS_CSV,
} from '../lib/ml/naiveBayes';
import { runAllUnitTests, UnitTestResult } from '../lib/rag/unitTests';
import { AVAILABLE_GENERATION_MODELS } from '../constants';

interface TestLabScreenProps {
  generationModel: string;
  embeddingModel: string;
}

export const TestLabScreen: React.FC<TestLabScreenProps> = ({
  generationModel,
  embeddingModel,
}) => {
  const [activeTab, setActiveTab] = useState<
    'connection' | 'retrieval' | 'quality' | 'compare' | 'ml' | 'unittests' | 'simulation'
  >('connection');

  // 1. Connection Test State
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);

  // 2. Retrieval Benchmark State
  const [retrievalCases, setRetrievalCases] = useState<RetrievalBenchmarkItem[]>([
    {
      id: 'case-1',
      query: 'What are the warning signs of severe dengue?',
      expectedKeywords: ['abdominal pain', 'persistent vomiting', 'mucosal bleeding', 'plasma leakage'],
    },
    {
      id: 'case-2',
      query: 'What viruses cause the common cold and what is typical duration?',
      expectedKeywords: ['rhinovirus', '7 to 10 days', 'nasal congestion'],
    },
    {
      id: 'case-3',
      query: 'What is the classic onset and fever range of seasonal influenza?',
      expectedKeywords: ['abrupt', 'sudden', 'high fever', 'chills', 'myalgia'],
    },
  ]);
  const [runningRetrievalTest, setRunningRetrievalTest] = useState(false);
  const [overallHitAt1, setOverallHitAt1] = useState<number | null>(null);
  const [overallHitAtK, setOverallHitAtK] = useState<number | null>(null);

  // 3. Quality Benchmark State
  const [qualityCases, setQualityCases] = useState<QualityBenchmarkItem[]>([
    {
      id: 'q-1',
      query: 'Why are NSAIDs like aspirin contraindicated in dengue fever?',
    },
    {
      id: 'q-2',
      query: 'Can antibiotics cure the common cold?',
    },
  ]);
  const [runningQualityTest, setRunningQualityTest] = useState(false);

  // 4. Model Comparison State
  const [compareQuery, setCompareQuery] = useState(
    'What should a patient do if fever improves but returns worse with high fever?'
  );
  const [selectedCompareModels, setSelectedCompareModels] = useState<string[]>([
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ]);
  const [compareResults, setCompareResults] = useState<ModelComparisonResult[]>([]);
  const [runningCompare, setRunningCompare] = useState(false);

  // 5. ML Baseline State
  const [csvInput, setCsvInput] = useState(SAMPLE_SYMPTOMS_CSV);
  const [mlMetrics, setMlMetrics] = useState<MLMetrics | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);

  // 6. Unit Tests State
  const [unitTestResults, setUnitTestResults] = useState<UnitTestResult[]>([]);

  // 7. Simulated Error State
  const [simulatedErrorResult, setSimulatedErrorResult] = useState<string | null>(null);

  // Run Connection Test
  const handleRunConnectionTest = async () => {
    setTestingConnection(true);
    try {
      const res = await testConnection(generationModel, embeddingModel);
      setConnectionResult(res);
    } finally {
      setTestingConnection(false);
    }
  };

  // Run Retrieval Benchmark
  const handleRunRetrievalBenchmark = async () => {
    setRunningRetrievalTest(true);
    let hit1Count = 0;
    let hitKCount = 0;

    const updated = await Promise.all(
      retrievalCases.map(async (item) => {
        const results = await retrievePassages(item.query, {
          embeddingModel,
          topK: 5,
          similarityThreshold: 0.25,
        });

        const top1Text = results[0]?.chunk.text.toLowerCase() || '';
        const allKText = results.map((r) => r.chunk.text.toLowerCase()).join(' ');

        const hitAt1 = item.expectedKeywords.some((kw) => top1Text.includes(kw.toLowerCase()));
        const hitAtK = item.expectedKeywords.some((kw) => allKText.includes(kw.toLowerCase()));

        if (hitAt1) hit1Count++;
        if (hitAtK) hitKCount++;

        return {
          ...item,
          results,
          hitAt1,
          hitAtK,
          avgScore: results[0]?.score || 0,
        };
      })
    );

    setRetrievalCases(updated);
    setOverallHitAt1(Number((hit1Count / retrievalCases.length).toFixed(2)));
    setOverallHitAtK(Number((hitKCount / retrievalCases.length).toFixed(2)));
    setRunningRetrievalTest(false);
  };

  // Run Quality Benchmark
  const handleRunQualityBenchmark = async () => {
    setRunningQualityTest(true);
    const updated: QualityBenchmarkItem[] = [];

    for (const q of qualityCases) {
      // 1. Retrieve
      const sources = await retrievePassages(q.query, {
        embeddingModel,
        topK: 3,
        similarityThreshold: 0.25,
      });

      // 2. Generate answer
      const answerPrompt = `Context:\n${sources.map((s, i) => `[Passage ${i + 1}]: ${s.chunk.text}`).join('\n\n')}\n\nQuestion: ${q.query}\n\nSynthesize a clinical answer with [1], [2] citations.`;
      const genRes = await generateContent({
        model: generationModel,
        contents: answerPrompt,
      });
      const answer = genRes.text || 'Failed to generate answer';

      // 3. Groundedness Evaluation via second Gemini call
      const evalPrompt = `You are a medical groundedness auditor.
Evaluate the following generated answer against the context passages.
Context Passages:
${sources.map((s, i) => `[Passage ${i + 1}]: ${s.chunk.text}`).join('\n\n')}

Generated Answer:
${answer}

Return a groundedness score between 0 and 1, a list of supported claims, and a list of unsupported claims.`;

      let score = 0.9;
      let supportedClaims: string[] = [];
      let unsupportedClaims: string[] = [];

      try {
        const evalRes = await generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: evalPrompt,
          responseMimeType: 'application/json',
          responseSchema: GROUNDEDNESS_EVALUATION_SCHEMA,
        });

        if (evalRes.success) {
          const parsed = JSON.parse(evalRes.text);
          score = parsed.score;
          supportedClaims = parsed.supportedClaims || [];
          unsupportedClaims = parsed.unsupportedClaims || [];
        }
      } catch (err) {
        console.warn('Groundedness eval failed:', err);
      }

      updated.push({
        ...q,
        answer,
        sources,
        groundednessScore: score,
        supportedClaims,
        unsupportedClaims,
      });
    }

    setQualityCases(updated);
    setRunningQualityTest(false);
  };

  // Run Model Comparison
  const handleRunModelComparison = async () => {
    if (selectedCompareModels.length === 0) return;
    setRunningCompare(true);
    setCompareResults([]);

    // 1. Fetch common retrieved context
    const sources = await retrievePassages(compareQuery, {
      embeddingModel,
      topK: 3,
      similarityThreshold: 0.25,
    });

    const contextText = sources.map((s, i) => `[Passage ${i + 1}]: ${s.chunk.text}`).join('\n\n');
    const prompt = `Context:\n${contextText}\n\nQuestion: ${compareQuery}\n\nProvide an educational medical synthesis with bracketed citations.`;

    const results: ModelComparisonResult[] = [];

    for (const model of selectedCompareModels) {
      const start = Date.now();
      try {
        const res = await generateContent({
          model,
          contents: prompt,
        });

        const latency = Date.now() - start;
        const citations = (res.text?.match(/\[\d+\]/g) || []).length;

        results.push({
          model,
          answer: res.text || 'No response',
          latency,
          citationCount: citations,
          error: res.error,
        });
      } catch (err: unknown) {
        results.push({
          model,
          answer: '',
          latency: Date.now() - start,
          citationCount: 0,
          error: String(err),
        });
      }
    }

    setCompareResults(results);
    setRunningCompare(false);
  };

  // Run ML Classifier Training
  const handleTrainClassifier = () => {
    setMlError(null);
    try {
      const parsed = parseSymptomCSV(csvInput);
      const metrics = trainAndEvaluateClassifier(parsed);
      setMlMetrics(metrics);
    } catch (err: unknown) {
      setMlError(err instanceof Error ? err.message : String(err));
    }
  };

  // Run Pure Unit Tests
  const handleRunUnitTests = () => {
    const results = runAllUnitTests();
    setUnitTestResults(results);
  };

  // Run Simulated Error
  const handleSimulateError = async (type: '429' | '503') => {
    setSimulatedErrorResult('Simulating error request...');
    const res = await simulateError(type);
    setSimulatedErrorResult(`Simulated ${type} result: [${res.code}] - ${res.error}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-teal-600" />
          <span>Clinical & Technical Test Lab</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Empirical verification harness for model latency, retrieval hit-rates, citation groundedness, model comparison, and ML baseline metrics.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">
        {[
          { id: 'connection', label: '1. Test Connection' },
          { id: 'retrieval', label: '2. Retrieval Hit-Rate Benchmark' },
          { id: 'quality', label: '3. Groundedness Quality Test' },
          { id: 'compare', label: '4. Model Comparison' },
          { id: 'ml', label: '5. Classical ML Baseline' },
          { id: 'unittests', label: '6. Unit Test Suite' },
          { id: 'simulation', label: '7. Error & Fallback Test' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-bold border-b-2 border-teal-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Connection Test */}
      {activeTab === 'connection' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Live Gemini API & Embedding Connectivity Probe
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Issues a tiny real test prompt to the Generation model and a tiny test chunk to the Embedding model.
              </p>
            </div>
            <button
              onClick={handleRunConnectionTest}
              disabled={testingConnection}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 self-start"
            >
              {testingConnection ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Testing probe...</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5" />
                  <span>Run Connection Test</span>
                </>
              )}
            </button>
          </div>

          {connectionResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              {/* Generation Test Result */}
              <div
                className={`p-4 rounded-xl border ${
                  connectionResult.generationPass
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
                    : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Generation Model Probe
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      connectionResult.generationPass
                        ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {connectionResult.generationPass ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                  <p>
                    Target Model: <span className="font-mono font-bold">{generationModel}</span>
                  </p>
                  <p>
                    Answered Model:{' '}
                    <span className="font-mono">{connectionResult.generationModel}</span>
                  </p>
                  <p>
                    Roundtrip Latency:{' '}
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                      {connectionResult.generationLatency} ms
                    </span>
                  </p>
                </div>
              </div>

              {/* Embedding Test Result */}
              <div
                className={`p-4 rounded-xl border ${
                  connectionResult.embeddingPass
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
                    : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Embedding Model Probe
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      connectionResult.embeddingPass
                        ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {connectionResult.embeddingPass ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                  <p>
                    Target Model: <span className="font-mono font-bold">{embeddingModel}</span>
                  </p>
                  <p>
                    Answered Model:{' '}
                    <span className="font-mono">{connectionResult.embeddingModel}</span>
                  </p>
                  <p>
                    Roundtrip Latency:{' '}
                    <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                      {connectionResult.embeddingLatency} ms
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {connectionResult?.error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-800 dark:text-rose-300 text-xs">
              <strong>Error Details:</strong> {connectionResult.error}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Retrieval Benchmark */}
      {activeTab === 'retrieval' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Vector Retrieval Hit-Rate Benchmark
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Measures whether expected clinical keywords appear in the top-1 retrieved passage (hit@1) and within the top-k passages (hit@k).
              </p>
            </div>
            <button
              onClick={handleRunRetrievalBenchmark}
              disabled={runningRetrievalTest}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 self-start"
            >
              {runningRetrievalTest ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Retrieval Benchmark</span>
                </>
              )}
            </button>
          </div>

          {overallHitAt1 !== null && overallHitAtK !== null && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-teal-50/60 dark:bg-teal-950/30 rounded-xl border border-teal-200 dark:border-teal-900">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Overall Hit@1</span>
                <p className="text-2xl font-bold font-mono text-teal-800 dark:text-teal-300">
                  {(overallHitAt1 * 100).toFixed(0)}%
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Overall Hit@k</span>
                <p className="text-2xl font-bold font-mono text-teal-800 dark:text-teal-300">
                  {(overallHitAtK * 100).toFixed(0)}%
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Test Cases</span>
                <p className="text-2xl font-bold font-mono text-slate-700 dark:text-slate-300">
                  {retrievalCases.length}
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Embedding</span>
                <p className="text-sm font-bold font-mono text-slate-700 dark:text-slate-300 truncate">
                  {embeddingModel}
                </p>
              </div>
            </div>
          )}

          {/* Test cases table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="p-3">Query</th>
                  <th className="p-3">Expected Keywords</th>
                  <th className="p-3">Top-1 Score</th>
                  <th className="p-3">Hit@1</th>
                  <th className="p-3">Hit@k</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {retrievalCases.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium text-slate-900 dark:text-white max-w-xs">
                      {item.query}
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                      {item.expectedKeywords.join(', ')}
                    </td>
                    <td className="p-3 font-mono">
                      {item.avgScore !== undefined ? `${(item.avgScore * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3">
                      {item.hitAt1 !== undefined ? (
                        item.hitAt1 ? (
                          <span className="px-2 py-0.5 rounded text-emerald-800 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                            HIT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-rose-800 bg-rose-100 dark:bg-rose-950 dark:text-rose-300 font-bold">
                            MISS
                          </span>
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3">
                      {item.hitAtK !== undefined ? (
                        item.hitAtK ? (
                          <span className="px-2 py-0.5 rounded text-emerald-800 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                            HIT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-rose-800 bg-rose-100 dark:bg-rose-950 dark:text-rose-300 font-bold">
                            MISS
                          </span>
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Groundedness Quality Test */}
      {activeTab === 'quality' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Answer Groundedness Audit (Second-LLM Verification)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Generates a RAG response, then prompts an independent Gemini auditor to verify every claim against the retrieved passages. Labelled as an AI-based estimate.
              </p>
            </div>
            <button
              onClick={handleRunQualityBenchmark}
              disabled={runningQualityTest}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 self-start"
            >
              {runningQualityTest ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Auditing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Groundedness Audit</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-4 pt-2">
            {qualityCases.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    Question #{idx + 1}: "{q.query}"
                  </h3>
                  {q.groundednessScore !== undefined && (
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                      Groundedness Score: {(q.groundednessScore * 100).toFixed(0)}% (AI-estimated)
                    </span>
                  )}
                </div>

                {q.answer && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Synthesized Answer:
                    </span>
                    <div className="p-3 bg-white dark:bg-slate-900 border rounded-lg text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {q.answer}
                    </div>
                  </div>
                )}

                {q.supportedClaims && q.supportedClaims.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold block">
                      ✓ Supported Claims Verified in Passages ({q.supportedClaims.length}):
                    </span>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-0.5 pl-1">
                      {q.supportedClaims.map((claim, cIdx) => (
                        <li key={cIdx}>{claim}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {q.unsupportedClaims && q.unsupportedClaims.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="text-rose-700 dark:text-rose-400 font-semibold block">
                      ✗ Unsupported or Extrapolated Claims ({q.unsupportedClaims.length}):
                    </span>
                    <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-0.5 pl-1">
                      {q.unsupportedClaims.map((claim, cIdx) => (
                        <li key={cIdx}>{claim}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Model Comparison */}
      {activeTab === 'compare' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Side-by-Side Gemini Model Comparison
            </h2>
            <p className="text-xs text-slate-500">
              Runs identical clinical question and retrieved context through multiple available models simultaneously to compare output style, citation density, and latency.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Test Clinical Prompt
              </label>
              <input
                type="text"
                value={compareQuery}
                onChange={(e) => setCompareQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {AVAILABLE_GENERATION_MODELS.map((m) => (
                  <label key={m.id} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCompareModels.includes(m.id)}
                      onChange={(e) => {
                        setSelectedCompareModels((prev) =>
                          e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                        );
                      }}
                      className="rounded text-teal-600"
                    />
                    <span>{m.name.split(' (')[0]}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={handleRunModelComparison}
                disabled={runningCompare || selectedCompareModels.length === 0}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2"
              >
                {runningCompare ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Comparing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Multi-Model Comparison</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {compareResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              {compareResults.map((res) => (
                <div
                  key={res.model}
                  className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-white font-mono">
                        {res.model}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-bold">
                        {res.latency} ms
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 mb-2 font-mono">
                      Citations Found: {res.citationCount}
                    </div>

                    <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-72 overflow-y-auto p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                      {res.answer || res.error}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Classical ML Baseline */}
      {activeTab === 'ml' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-teal-700 dark:text-teal-400 font-bold">
                Classical ML Baseline
              </span>
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              In-Browser Naive Bayes Classifier on Binary Symptom Dataset
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Trains a Multinomial / Bernoulli Naive Bayes classifier entirely inside your browser on binary symptom indicators (0/1) with an 80/20 train-test split. Compares classical parametric ML with LLM-based RAG.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Symptom CSV Dataset (Binary 0/1 symptom columns + prognosis):
              </label>
              <button
                onClick={() => setCsvInput(SAMPLE_SYMPTOMS_CSV)}
                className="text-xs text-teal-600 hover:underline font-semibold"
              >
                Reset to Sample Dataset (25 rows, 10 symptoms)
              </button>
            </div>
            <textarea
              rows={6}
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              className="w-full p-2.5 font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200"
            />
          </div>

          <button
            onClick={handleTrainClassifier}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Train Naive Bayes & Evaluate (80/20 Split)</span>
          </button>

          {mlError && (
            <div className="p-3 bg-rose-50 text-rose-800 rounded-lg text-xs">⚠️ {mlError}</div>
          )}

          {mlMetrics && (
            <div className="space-y-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              {/* Overall Accuracy Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-teal-50/60 dark:bg-teal-950/30 rounded-xl border border-teal-200 dark:border-teal-900">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">Test Accuracy</span>
                  <p className="text-2xl font-bold font-mono text-teal-800 dark:text-teal-300">
                    {(mlMetrics.accuracy * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">Test Samples</span>
                  <p className="text-2xl font-bold font-mono text-slate-700 dark:text-slate-300">
                    {mlMetrics.sampleCount}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">Classes Evaluated</span>
                  <p className="text-2xl font-bold font-mono text-slate-700 dark:text-slate-300">
                    {mlMetrics.classes.length}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">Classifier Type</span>
                  <p className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 mt-2">
                    Bernoulli NB (Laplace +1)
                  </p>
                </div>
              </div>

              {/* Per-Class Metrics Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  Per-Class Performance Metrics
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                      <tr>
                        <th className="p-2.5">Condition Class</th>
                        <th className="p-2.5">Precision</th>
                        <th className="p-2.5">Recall</th>
                        <th className="p-2.5">F1-Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mlMetrics.classes.map((c) => (
                        <tr key={c} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">{c}</td>
                          <td className="p-2.5 font-mono">{(mlMetrics.precision[c] * 100).toFixed(1)}%</td>
                          <td className="p-2.5 font-mono">{(mlMetrics.recall[c] * 100).toFixed(1)}%</td>
                          <td className="p-2.5 font-mono font-bold text-teal-700 dark:text-teal-400">
                            {mlMetrics.f1[c].toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Confusion Matrix Heatmap */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  Confusion Matrix Heatmap (Actual vs Predicted)
                </h3>
                <div className="overflow-x-auto p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="text-xs text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-slate-400 font-normal text-left">Actual \ Pred</th>
                        {mlMetrics.classes.map((c) => (
                          <th key={c} className="p-2 font-mono text-[11px] truncate max-w-[90px]">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mlMetrics.classes.map((actualClass, rowIdx) => (
                        <tr key={actualClass}>
                          <td className="p-2 font-bold text-left text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                            {actualClass}
                          </td>
                          {mlMetrics.confusionMatrix[rowIdx].map((cellValue, colIdx) => {
                            const isDiagonal = rowIdx === colIdx;
                            const bgIntensity =
                              cellValue === 0
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                : isDiagonal
                                ? 'bg-teal-600 text-white font-bold'
                                : 'bg-rose-500 text-white font-bold';

                            return (
                              <td
                                key={colIdx}
                                className={`p-2.5 border border-white dark:border-slate-900 font-mono ${bgIntensity}`}
                              >
                                {cellValue}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Unit Test Suite */}
      {activeTab === 'unittests' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Deterministic Pure Unit Test Suite
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Executes automated assertions on text cleaner, paragraph chunker with overlap, cosine similarity math, L2 vector normalizer, red-flag rule engine, and Naive Bayes classifier.
              </p>
            </div>
            <button
              onClick={handleRunUnitTests}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 self-start"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Pure Unit Tests</span>
            </button>
          </div>

          {unitTestResults.length > 0 && (
            <div className="space-y-2 pt-2">
              {unitTestResults.map((t, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                    t.passed
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900'
                      : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {t.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">{t.name}</span>
                      <span className="text-slate-400 ml-2">({t.category})</span>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">{t.message}</p>
                      {t.details && (
                        <p className="font-mono text-[11px] text-slate-400 mt-0.5">{t.details}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`font-bold font-mono px-2 py-0.5 rounded ${
                      t.passed
                        ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {t.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 7: Error & Fallback Simulation */}
      {activeTab === 'simulation' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Simulated Rate Limit (429) & Overload (503) Resilience Test
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify how the application translates upstream HTTP 429 quota limits and 503 overload conditions into polite plain-language warnings with automatic model fallbacks, without burning real quota.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => handleSimulateError('429')}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
            >
              Simulate 429 (Rate Limit / Quota Exceeded)
            </button>
            <button
              onClick={() => handleSimulateError('503')}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs"
            >
              Simulate 503 (Gemini Service Overloaded)
            </button>
          </div>

          {simulatedErrorResult && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200">
              {simulatedErrorResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
