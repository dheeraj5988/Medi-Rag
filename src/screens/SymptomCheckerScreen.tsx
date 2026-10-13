import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Stethoscope,
  AlertTriangle,
  Printer,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Info,
  Check,
  ExternalLink,
  KeyRound,
} from 'lucide-react';
import { ConditionSuggestion, RedFlagAlert, RetrievalResult } from '../types';
import { callCounter, fetchHealth, generateContent, resetCallCounter } from '../lib/gemini/client';
import { retrieveForCondition } from '../lib/rag/pipeline';
import { detectRedFlags } from '../lib/rag/redFlags';
import { loadSymptomModel, rankDiseases, SymptomModelFile } from '../lib/ml/symptomModel';
import { extractSymptomIds } from '../lib/ml/symptomExtract';
import { CitationModal } from '../components/CitationModal';
import { Sheet } from '../components/Sheet';
import { SYMPTOM_SYNTHESIS_SCHEMA, SYMPTOM_SYNTHESIS_SYSTEM_PROMPT } from '../prompts';
import { FIXED_MEDICAL_DISCLAIMER } from '../constants';

/** Common symptoms shown as big toggle chips (label -> id in the symptom model). */
const COMMON_SYMPTOMS: Array<{ label: string; id: string }> = [
  { label: 'Fever', id: 'high_fever' },
  { label: 'Cough', id: 'cough' },
  { label: 'Sore throat', id: 'throat_irritation' },
  { label: 'Body ache', id: 'muscle_pain' },
  { label: 'Headache', id: 'headache' },
  { label: 'Pain behind eyes', id: 'pain_behind_the_eyes' },
  { label: 'Nausea', id: 'nausea' },
  { label: 'Vomiting', id: 'vomiting' },
  { label: 'Skin rash', id: 'skin_rash' },
  { label: 'Itching', id: 'itching' },
  { label: 'Breathlessness', id: 'breathlessness' },
  { label: 'Chest pain', id: 'chest_pain' },
  { label: 'Chills', id: 'chills' },
  { label: 'Sneezing', id: 'continuous_sneezing' },
  { label: 'Runny nose', id: 'runny_nose' },
  { label: 'Fatigue', id: 'fatigue' },
  { label: 'Loss of appetite', id: 'loss_of_appetite' },
  { label: 'Diarrhoea', id: 'diarrhoea' },
  { label: 'Joint pain', id: 'joint_pain' },
  { label: 'Dizziness', id: 'dizziness' },
];

const EXAMPLES: Array<{ label: string; text: string }> = [
  { label: 'Dengue-like', text: 'High fever, headache, body pain, skin rash and pain behind the eyes for three days' },
  { label: 'Cold-like', text: 'Fever, cough, sore throat and runny nose' },
  { label: 'Urinary', text: 'Burning while urinating, bladder discomfort and foul smell of urine' },
  { label: 'Liver-like', text: 'Yellowing of eyes, dark urine, loss of appetite and fatigue' },
];

const STRENGTH_STYLE: Record<ConditionSuggestion['strengthLabel'], { label: string; cls: string }> = {
  strong: { label: 'Strong possible match', cls: 'bg-lime-400 text-slate-900 border-slate-900' },
  moderate: { label: 'Moderate possible match', cls: 'bg-amber-200 text-slate-900 border-slate-900' },
  weak: { label: 'Weak possible match', cls: 'bg-slate-200 text-slate-900 border-slate-900' },
};

interface SymptomCheckerScreenProps {
  generationModel: string;
  embeddingModel: string;
  onTriggerRedFlag: (alert: RedFlagAlert) => void;
}

type Stage = 'idle' | 'mapping' | 'ranking' | 'retrieving' | 'explaining' | 'complete';

interface ResultCondition extends ConditionSuggestion {
  explanationState: 'pending' | 'done' | 'unavailable';
}

interface EvalFile {
  robustness: Array<{ symptoms_reported: number; top1: number; top3: number }>;
}

/** Turn "[1]" markers in model text into tappable citation badges. */
function renderWithCitations(text: string, byNumber: Map<number, RetrievalResult>, open: (r: RetrievalResult, n: number) => void) {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    const hit = m ? byNumber.get(Number(m[1])) : undefined;
    if (m && hit) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => open(hit, Number(m[1]))}
          className="tap-auto inline-flex items-center justify-center min-h-0 h-6 min-w-6 px-1.5 mx-0.5 rounded-md bg-lime-400 text-slate-900 border border-slate-900 text-xs font-extrabold align-baseline"
          aria-label={`Open source ${m[1]}`}
        >
          {m[1]}
        </button>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export const SymptomCheckerScreen: React.FC<SymptomCheckerScreenProps> = ({ generationModel, embeddingModel, onTriggerRedFlag }) => {
  // Symptom model (loaded once)
  const [model, setModel] = useState<SymptomModelFile | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [evalData, setEvalData] = useState<EvalFile | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Form state
  const [selected, setSelected] = useState<string[]>([]);
  const [symptomsText, setSymptomsText] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [sex, setSex] = useState<'female' | 'male' | 'other' | ''>('');
  const [pregnancy, setPregnancy] = useState(false);
  const [existingConditions, setExistingConditions] = useState('');
  const [duration, setDuration] = useState('');
  const [severity, setSeverity] = useState(5);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  // Pipeline state
  const [stage, setStage] = useState<Stage>('idle');
  const [results, setResults] = useState<ResultCondition[]>([]);
  const [recognised, setRecognised] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [callsUsed, setCallsUsed] = useState<number | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<{ result: RetrievalResult; index: number } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSymptomModel().then(setModel).catch((e) => setModelError(e instanceof Error ? e.message : String(e)));
    fetch('/model/symptom_model_eval.json').then((r) => (r.ok ? r.json() : null)).then(setEvalData).catch(() => undefined);
    fetchHealth().then((h) => setHasKey(h.hasApiKey));
  }, []);

  const labelById = useMemo(() => new Map(model?.symptoms.map((s) => [s.id, s.label]) || []), [model]);
  const idByLabel = useMemo(() => new Map(model?.symptoms.map((s) => [s.label, s.id]) || []), [model]);
  const busy = stage !== 'idle' && stage !== 'complete';

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const citationMap = useMemo(() => {
    const m = new Map<number, RetrievalResult>();
    results.forEach((r) => r.citations?.forEach((c) => m.set(c.number, c)));
    return m;
  }, [results]);

  const openCitation = (r: RetrievalResult, n: number) => setSelectedCitation({ result: r, index: n });

  const analyze = async (extraId?: string) => {
    if (!model) return;
    const ids0 = extraId && !selected.includes(extraId) ? [...selected, extraId] : selected;
    if (extraId) setSelected(ids0);
    if (!symptomsText.trim() && ids0.length === 0) {
      setError('Describe your symptoms or pick some from the list.');
      return;
    }

    setError(null);
    setNotices([]);
    setResults([]);
    setCallsUsed(null);
    resetCallCounter();
    const noticeList: string[] = [];

    // 1. Deterministic red-flag check FIRST (never delegated to the LLM)
    const chipLabels = ids0.map((id) => labelById.get(id) || id).join(', ');
    const redFlag = detectRedFlags(`${symptomsText} ${chipLabels}`);
    if (redFlag.triggered) onTriggerRedFlag(redFlag);

    try {
      const health = await fetchHealth(true);
      setHasKey(health.hasApiKey);

      // 2. Free text + chips -> symptom ids (one structured Gemini call only when text is given and a key exists)
      setStage('mapping');
      const extraction = await extractSymptomIds(symptomsText, model, { useLLM: health.hasApiKey, generationModel });
      if (extraction.warning) noticeList.push(extraction.warning);
      const ids = Array.from(new Set([...ids0, ...extraction.ids]));
      if (ids.length === 0) {
        setError('I could not recognise any symptoms. Try picking from the list, or describe them in simple words (for example "fever and sore throat").');
        setStage('idle');
        return;
      }
      setRecognised(ids.map((id) => labelById.get(id) || id));

      // 3. ML shortlist (Naive Bayes on the reported symptoms, in the browser, free)
      setStage('ranking');
      const ranked = rankDiseases(model, ids, 3);

      // 4. Grounding passages per predicted condition (filtered to that condition's MedlinePlus pages, free)
      setStage('retrieving');
      const symptomLabels = ids.map((id) => labelById.get(id) || id).join(' ');
      let counter = 0;
      const built: ResultCondition[] = [];
      for (const r of ranked) {
        const passages = await retrieveForCondition(r.disease, symptomLabels, { embeddingModel, topK: 2 });
        built.push({
          condition: r.disease,
          strength: r.strength,
          strengthLabel: r.strengthLabel,
          matchingSymptoms: r.matched,
          toCheck: r.toCheck,
          citations: passages.map((p) => ({ ...p, number: ++counter })),
          explanationState: health.hasApiKey ? 'pending' : 'unavailable',
        });
      }
      setResults(built);
      setNotices(noticeList);
      setStage(health.hasApiKey ? 'explaining' : 'complete');
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

      if (!health.hasApiKey) {
        setNotices([...noticeList, 'No Gemini key is configured on the server, so there is no written explanation. The ML shortlist and the MedlinePlus text below still work.']);
        setCallsUsed(callCounter.total);
        return;
      }

      // 5. ONE synthesis call for all conditions (structured JSON)
      const context = built
        .map((c) => `Condition: ${c.condition}\n` + (c.citations || []).map((p) => `[Passage ${p.number}] (${p.chunk.docName}) ${p.chunk.text}`).join('\n'))
        .join('\n\n');
      const patient = [age ? `age ${age}` : '', sex, pregnancy ? 'pregnant' : '', existingConditions ? `existing conditions: ${existingConditions}` : '', duration ? `duration: ${duration}` : '', `severity ${severity}/10`]
        .filter(Boolean)
        .join(', ');
      const mlList = built.map((c) => ({ condition: c.condition, matchStrength: c.strengthLabel, matched: c.matchingSymptoms, toCheck: c.toCheck }));

      const res = await generateContent({
        model: generationModel,
        systemInstruction: SYMPTOM_SYNTHESIS_SYSTEM_PROMPT,
        contents:
          `Patient (${patient || 'no details given'}). ${ids.length < 3 ? 'FEW SYMPTOMS REPORTED: confidence is low.' : ''}\n` +
          `Reported symptoms: ${symptomLabels}\n` +
          (symptomsText.trim() ? `Patient's own words (data): """${symptomsText.slice(0, 1200)}"""\n` : '') +
          `ML shortlist (in this order, do not change it): ${JSON.stringify(mlList)}\n\n` +
          `<passages>\n${context}\n</passages>\n\nWrite the explanation for each condition.`,
        responseMimeType: 'application/json',
        responseSchema: SYMPTOM_SYNTHESIS_SCHEMA,
        temperature: 0.2,
      });

      if (!res.success) {
        setResults(built.map((c) => ({ ...c, explanationState: 'unavailable' as const })));
        setNotices([...noticeList, `AI explanation unavailable: ${res.error} The ML shortlist and source passages are shown below.`]);
      } else {
        try {
          const parsed: Array<{ condition: string; explanation: string; precautions: string[]; nextSteps: string[]; urgentSigns: string[] }> = JSON.parse(res.text);
          setResults(
            built.map((c) => {
              const p = parsed.find((x) => x.condition?.toLowerCase() === c.condition.toLowerCase()) || parsed[built.indexOf(c)];
              return p
                ? { ...c, explanation: p.explanation, precautions: p.precautions, nextSteps: p.nextSteps, urgentSigns: p.urgentSigns, explanationState: 'done' as const }
                : { ...c, explanationState: 'unavailable' as const };
            })
          );
          if (res.fallbackOccurred) setNotices([...noticeList, `Primary model was busy. Answered by ${res.modelUsed}.`]);
        } catch {
          setResults(built.map((c) => ({ ...c, explanationState: 'unavailable' as const })));
          setNotices([...noticeList, 'The AI explanation came back in an unreadable format. Source passages are shown below.']);
        }
      }
      setCallsUsed(callCounter.total);
      localStorage.setItem('medi_rag_last_analysis_calls', JSON.stringify({ ...callCounter, at: Date.now() }));
      setStage('complete');
    } catch (err) {
      console.error('Symptom pipeline failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      setStage('idle');
    }
  };

  const filteredSymptoms = (model?.symptoms || []).filter((s) => !pickerQuery || s.label.includes(pickerQuery.toLowerCase()));
  const kForEval = Math.min(5, Math.max(2, recognised.length));
  const evalRow = evalData?.robustness.find((r) => r.symptoms_reported === kForEval);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 md:py-8 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="kicker">Step by step, in plain words</span>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-[1.05] mt-1 flex items-center gap-2">
            <Stethoscope className="w-8 h-8 text-teal-600 shrink-0" aria-hidden="true" />
            <span>How are you feeling?</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-xl">
            A symptom model shortlists possible conditions, then trusted MedlinePlus text explains them. Educational only, never a diagnosis.
          </p>
        </div>
        {stage === 'complete' && results.length > 0 && (
          <button onClick={() => window.print()} className="btn btn-sm print:hidden self-start sm:self-auto">
            <Printer className="w-4 h-4" />
            <span>Print / save PDF</span>
          </button>
        )}
      </div>

      {hasKey === false && (
        <div className="card-flat p-3 flex items-start gap-2.5 text-sm print:hidden">
          <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p>
            <b>Offline mode:</b> no Gemini key is set on the server. The symptom model and MedlinePlus retrieval still work; add <code>GEMINI_API_KEY</code> to <code>.env</code> and restart for written explanations and free-text understanding in any language.
          </p>
        </div>
      )}
      {modelError && <div className="alert-box p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-300 text-sm">Symptom model failed to load: {modelError}</div>}
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border-[1.5px] border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="btn btn-ghost btn-sm shrink-0">Dismiss</button>
        </div>
      )}

      {/* ---- Step 1: symptoms ---- */}
      <section className="card p-4 sm:p-6 space-y-5 print:hidden" aria-labelledby="sc-step1">
        <div>
          <span className="kicker">Step 1</span>
          <h2 id="sc-step1" className="text-xl font-bold">What are you noticing?</h2>
        </div>

        <div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Common symptoms">
            {COMMON_SYMPTOMS.map((s) => {
              const isOn = selected.includes(s.id);
              return (
                <button key={s.id} type="button" className="chip" aria-pressed={isOn} onClick={() => toggle(s.id)}>
                  {isOn && <Check className="w-4 h-4" aria-hidden="true" />}
                  {s.label}
                </button>
              );
            })}
            <button type="button" className="chip border-dashed" onClick={() => setPickerOpen(true)}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              More ({model ? model.symptoms.length : '...'})
            </button>
          </div>
          {selected.some((id) => !COMMON_SYMPTOMS.some((c) => c.id === id)) && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Other selected symptoms">
              {selected
                .filter((id) => !COMMON_SYMPTOMS.some((c) => c.id === id))
                .map((id) => (
                  <button key={id} type="button" className="chip" aria-pressed={true} onClick={() => toggle(id)}>
                    <Check className="w-4 h-4" aria-hidden="true" />
                    {labelById.get(id) || id}
                  </button>
                ))}
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="sc-text">Or describe it in your own words (any language)</label>
          <textarea
            id="sc-text"
            rows={3}
            value={symptomsText}
            onChange={(e) => setSymptomsText(e.target.value)}
            placeholder="e.g. fever and body pain for 3 days, with a rash on my arms"
            className="field"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="chip" onClick={() => { setSymptomsText(ex.text); setSelected([]); }}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <details className="group">
          <summary className="cursor-pointer font-bold text-sm list-none flex items-center gap-2 select-none">
            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" aria-hidden="true" />
            Step 2 (optional): a few details
          </summary>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="sc-age">Age</label>
              <input id="sc-age" type="number" inputMode="numeric" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="sc-sex">Biological sex</label>
              <select id="sc-sex" value={sex} onChange={(e) => setSex(e.target.value as typeof sex)} className="field">
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sc-duration">How long?</label>
              <input id="sc-duration" type="text" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 3 days" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="sc-cond">Existing conditions or medicines</label>
              <input id="sc-cond" type="text" value={existingConditions} onChange={(e) => setExistingConditions(e.target.value)} placeholder="e.g. asthma, diabetes" className="field" />
            </div>
            <label className="flex items-center gap-3 sm:col-span-2 min-h-11 cursor-pointer font-semibold text-sm">
              <input type="checkbox" checked={pregnancy} onChange={(e) => setPregnancy(e.target.checked)} className="accent-teal-600" />
              Currently pregnant
            </label>
            <div className="sm:col-span-2">
              <label className="label flex justify-between" htmlFor="sc-sev">
                <span>How strong is it?</span>
                <span className="font-mono">{severity}/10 ({severity >= 8 ? 'severe' : severity >= 5 ? 'moderate' : 'mild'})</span>
              </label>
              <input id="sc-sev" type="range" min={1} max={10} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} className="w-full accent-teal-600" />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">These details only shape the written explanation. The ML shortlist uses the symptoms alone.</p>
        </details>

        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>Skin-photo questions live in the Chat tab (experimental, not diagnostic).</span>
        </p>
      </section>

      {/* Sticky action bar */}
      <div className="sticky bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+8px)] md:bottom-3 z-20 print:hidden">
        <div className="card p-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 pl-1" aria-live="polite">
            {busy
              ? stage === 'mapping'
                ? 'Understanding your words...'
                : stage === 'ranking'
                ? 'Ranking possible conditions...'
                : stage === 'retrieving'
                ? 'Finding trusted sources...'
                : 'Writing a plain-language explanation...'
              : `${selected.length} symptom${selected.length === 1 ? '' : 's'} selected`}
          </span>
          <button type="button" onClick={() => analyze()} disabled={!model || (busy && stage !== 'explaining')} className="btn btn-primary shrink-0">
            {busy ? (
              <span className="dots" aria-hidden="true"><i /><i /><i /></span>
            ) : (
              <>
                <span>Analyse</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* ---- Results ---- */}
      <div ref={resultsRef} className="scroll-mt-4 space-y-4">
        {results.length > 0 && (
          <>
            <div className="flex flex-col gap-1">
              <span className="kicker">Results</span>
              <h2 className="text-2xl font-extrabold">Possible matches</h2>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                A shortlist to discuss with a doctor, not a diagnosis. Each bar compares a condition with the best match; it is not the chance that you have it.
              </p>
              {results[0]?.strengthLabel === 'weak' && (
                <p className="text-sm p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                  Several conditions fit about equally well with these symptoms. Adding more symptoms (see the questions below) usually separates them.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-xs font-bold">Symptoms used:</span>
                {recognised.map((s) => (
                  <span key={s} className="chip chip-static">{s}</span>
                ))}
              </div>
            </div>

            {notices.map((n, i) => (
              <div key={i} className="p-3 rounded-xl border-[1.5px] border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm">{n}</div>
            ))}

            {results.map((item, index) => {
              const st = STRENGTH_STYLE[item.strengthLabel];
              return (
                <motion.article
                  key={item.condition}
                  className="card p-4 sm:p-6 space-y-4"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.12, type: 'spring', damping: 22, stiffness: 220 }}
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-10 h-10 rounded-xl bg-slate-900 dark:bg-lime-400 text-lime-400 dark:text-slate-900 font-display font-extrabold text-lg flex items-center justify-center">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl sm:text-2xl font-extrabold leading-tight break-words">{item.condition}</h3>
                      <span className={`inline-block mt-1.5 px-2.5 py-0.5 rounded-full border-[1.5px] text-xs font-extrabold ${st.cls}`}>{st.label}</span>
                    </div>
                  </div>

                  <div className="meter" role="img" aria-label={`${st.label}: relative match strength`}>
                    <i style={{ width: `${Math.max(6, Math.round(item.strength * 100))}%` }} />
                  </div>

                  <div className="text-sm">
                    <b>Matches your symptoms:</b>{' '}
                    {item.matchingSymptoms.length > 0 ? item.matchingSymptoms.join(', ') : 'only weakly (see the questions below)'}
                  </div>

                  {item.toCheck.length > 0 && (
                    <div className="print:hidden">
                      <p className="text-sm font-bold mb-1.5">Do you also have any of these? Tap to add and re-run</p>
                      <div className="flex flex-wrap gap-2">
                        {item.toCheck.map((label) => (
                          <button key={label} type="button" className="chip" onClick={() => idByLabel.get(label) && analyze(idByLabel.get(label))} disabled={busy}>
                            <Plus className="w-4 h-4" aria-hidden="true" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LLM explanation */}
                  {item.explanationState === 'pending' && (
                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300 py-2">
                      <span className="dots" aria-hidden="true"><i /><i /><i /></span>
                      <span>Writing a plain-language explanation from the sources...</span>
                    </div>
                  )}
                  {item.explanationState === 'done' && (
                    <div className="space-y-3 text-base md:text-sm leading-relaxed">
                      <p>{renderWithCitations(item.explanation || '', citationMap, openCitation)}</p>
                      {item.precautions && item.precautions.length > 0 && (
                        <div>
                          <p className="font-extrabold">Precautions</p>
                          <ul className="list-disc pl-5 space-y-1">
                            {item.precautions.map((t, i) => <li key={i}>{renderWithCitations(t, citationMap, openCitation)}</li>)}
                          </ul>
                        </div>
                      )}
                      {item.nextSteps && item.nextSteps.length > 0 && (
                        <div>
                          <p className="font-extrabold">Next steps</p>
                          <ul className="list-disc pl-5 space-y-1">
                            {item.nextSteps.map((t, i) => <li key={i}>{renderWithCitations(t, citationMap, openCitation)}</li>)}
                          </ul>
                        </div>
                      )}
                      {item.urgentSigns && item.urgentSigns.length > 0 && (
                        <div className="p-3 rounded-xl border-[1.5px] border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200">
                          <p className="font-extrabold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true" /> See a doctor urgently if</p>
                          <ul className="list-disc pl-5 space-y-1 mt-1">
                            {item.urgentSigns.map((t, i) => <li key={i}>{renderWithCitations(t, citationMap, openCitation)}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Grounding: always inspectable */}
                  {item.citations && item.citations.length > 0 && (
                    <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-2">
                      <div className="text-sm font-extrabold flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-teal-600" aria-hidden="true" />
                        Sources
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.citations.map((c) => (
                          <button key={c.chunk.id} type="button" onClick={() => openCitation(c, c.number)} className="chip text-left">
                            <span className="font-extrabold">[{c.number}]</span>
                            <span className="truncate max-w-[10rem]">{c.chunk.docName}</span>
                          </button>
                        ))}
                      </div>
                      <details open={item.explanationState !== 'done'}>
                        <summary className="cursor-pointer text-sm font-bold select-none">Retrieved text used for grounding</summary>
                        <div className="mt-2 space-y-2">
                          {item.citations.map((c) => (
                            <div key={c.chunk.id} className="text-sm leading-relaxed">
                              <b>[{c.number}] {c.chunk.docName}</b>: {c.chunk.text.length > 700 ? `${c.chunk.text.slice(0, 700)}...` : c.chunk.text}
                              {c.chunk.url && (
                                <a href={c.chunk.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 font-bold underline">
                                  MedlinePlus <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </motion.article>
              );
            })}

            {/* Honest reference accuracy + cost */}
            <div className="card-flat p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              {evalRow && (
                <p>
                  <b>How reliable is the shortlist?</b> On held-out patterns of the public dataset with {kForEval} symptoms reported, the right disease was first{' '}
                  {(evalRow.top1 * 100).toFixed(0)}% of the time and in the top 3 {(evalRow.top3 * 100).toFixed(0)}% of the time. That dataset is synthetic, so real-world accuracy is lower.
                </p>
              )}
              {callsUsed !== null && <p><b>Gemini requests used by this analysis:</b> {callsUsed} (symptom mapping + one explanation; retrieval is free).</p>}
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-[1.5px] border-amber-500 text-amber-900 dark:text-amber-200 text-sm">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-extrabold uppercase tracking-wider text-xs block">Please read</span>
                  <p className="mt-1 leading-relaxed">{FIXED_MEDICAL_DISCLAIMER}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* All-symptoms picker */}
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="All symptoms" footer={<button className="btn btn-primary w-full" onClick={() => setPickerOpen(false)}>Done ({selected.length} selected)</button>}>
        <div className="relative mb-3">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search symptoms..." aria-label="Search symptoms" className="field !pl-11" />
        </div>
        <div className="flex flex-wrap gap-2">
          {filteredSymptoms.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={selected.includes(s.id)} onClick={() => toggle(s.id)}>
              {selected.includes(s.id) && <Check className="w-4 h-4" aria-hidden="true" />}
              {s.label}
            </button>
          ))}
          {filteredSymptoms.length === 0 && <p className="text-sm text-slate-500">No symptom matches "{pickerQuery}".</p>}
        </div>
      </Sheet>

      <CitationModal isOpen={Boolean(selectedCitation)} onClose={() => setSelectedCitation(null)} citation={selectedCitation?.result || null} citationIndex={selectedCitation?.index} />
    </div>
  );
};
