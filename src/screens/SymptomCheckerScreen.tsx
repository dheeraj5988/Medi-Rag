import React, { useState } from 'react';
import {
  Stethoscope,
  AlertTriangle,
  FileDown,
  Printer,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  HelpCircle,
  FileText,
  AlertOctagon,
} from 'lucide-react';
import {
  PatientProfile,
  ConditionSuggestion,
  ExtractedSymptoms,
  RedFlagAlert,
  RetrievalResult,
} from '../types';
import { generateContent } from '../lib/gemini/client';
import { retrievePassages } from '../lib/rag/pipeline';
import { detectRedFlags } from '../lib/rag/redFlags';
import { CitationModal } from '../components/CitationModal';
import { ImageCaptureControl, ImageAttachment } from '../components/ImageCaptureControl';
import {
  SYMPTOM_EXTRACTION_SCHEMA,
  CONDITION_SUGGESTION_SCHEMA,
} from '../prompts';
import { FIXED_MEDICAL_DISCLAIMER } from '../constants';

const COMMON_SYMPTOM_CHIPS = [
  'Fever',
  'Cough',
  'Sore Throat',
  'Body Ache',
  'Headache',
  'Retro-orbital Pain',
  'Nausea',
  'Skin Rash / Lesion',
  'Breathlessness',
  'Chest Pain',
  'Chills',
  'Sneezing',
  'Fatigue',
  'Loss of Appetite',
  'Runny Nose',
];

interface SymptomCheckerScreenProps {
  generationModel: string;
  embeddingModel: string;
  topK: number;
  similarityThreshold: number;
  rerankEnabled: boolean;
  onTriggerRedFlag: (alert: RedFlagAlert) => void;
}

export const SymptomCheckerScreen: React.FC<SymptomCheckerScreenProps> = ({
  generationModel,
  embeddingModel,
  topK,
  similarityThreshold,
  rerankEnabled,
  onTriggerRedFlag,
}) => {
  // Form State
  const [age, setAge] = useState<number | ''>(32);
  const [sex, setSex] = useState<'female' | 'male' | 'other' | ''>('female');
  const [pregnancy, setPregnancy] = useState(false);
  const [existingConditions, setExistingConditions] = useState('');
  const [symptomsText, setSymptomsText] = useState('');
  const [duration, setDuration] = useState('3 days');
  const [severity, setSeverity] = useState(6);
  const [selectedChips, setSelectedChips] = useState<string[]>(['Fever', 'Body Ache']);
  const [skinImage, setSkinImage] = useState<ImageAttachment | null>(null);

  // Analysis Pipeline States
  const [stage, setStage] = useState<'idle' | 'preprocessing' | 'suggesting' | 'rag' | 'complete'>('idle');
  const [extractedData, setExtractedData] = useState<ExtractedSymptoms | null>(null);
  const [conditionSuggestions, setConditionSuggestions] = useState<ConditionSuggestion[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<{ result: RetrievalResult; index: number } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Toggle common symptom chip
  const toggleChip = (chip: string) => {
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  // Run the full pipeline
  const handleAnalyzeSymptoms = async () => {
    const combinedSymptomInput = `${symptomsText} ${selectedChips.join(', ')} ${skinImage ? 'skin rash lesion photo' : ''}`.trim();
    if (!combinedSymptomInput && !skinImage) {
      setAnalysisError('Please enter symptoms in the text box, select common symptom chips, or attach a skin photo.');
      return;
    }

    setAnalysisError(null);
    setConditionSuggestions([]);

    // 1. Red Flag Detection Check immediately
    const redFlag = detectRedFlags(combinedSymptomInput);
    if (redFlag.triggered) {
      onTriggerRedFlag(redFlag);
    }

    try {
      // Step 1: Preprocessing & Normalization with Gemini Structured Output
      setStage('preprocessing');
      const extractionPrompt = `Analyze the following patient symptom report${skinImage ? ' AND the attached dermatological skin photo' : ''} to extract normalized clinical symptom entities, duration, severity, and key patient concerns.

Patient Details:
Age: ${age || 'Not provided'}, Sex: ${sex || 'Not provided'}, Pregnancy: ${pregnancy ? 'Yes' : 'No'}, Pre-existing conditions: ${existingConditions || 'None reported'}.
Reported Symptoms: ${symptomsText || (skinImage ? 'Skin rash photo attached' : 'Selected chips below')}
Selected Symptoms: ${selectedChips.join(', ')}
Reported Duration: ${duration}
Reported Severity: ${severity} / 10
${skinImage ? '[Patient attached a skin/rash photo. Analyze visible dermatological features such as erythema, lesion type, borders, and distribution].' : ''}`;

      const extractionRes = await generateContent({
        model: generationModel,
        contents: extractionPrompt,
        responseMimeType: 'application/json',
        responseSchema: SYMPTOM_EXTRACTION_SCHEMA,
        image: skinImage ? { base64: skinImage.base64, mimeType: skinImage.mimeType } : undefined,
      });

      if (!extractionRes.success) {
        throw new Error(extractionRes.error || 'Failed symptom entity extraction.');
      }

      const parsedExtraction: ExtractedSymptoms = JSON.parse(extractionRes.text);
      setExtractedData(parsedExtraction);

      // Step 2: Possible Conditions Suggestions via Gemini Structured Output
      setStage('suggesting');
      const suggestionsPrompt = `You are a medical diagnostic reasoning engine in educational decision-support mode.
Given the normalized patient symptoms${skinImage ? ' and the attached skin photo' : ''}, estimate the top 3 most clinically plausible conditions.
Provide the condition name, clinical likelihood (low, medium, high), matching symptoms from the report, and educational reasoning.

Patient Age: ${age}, Sex: ${sex}, Pregnancy: ${pregnancy ? 'Yes' : 'No'}, Pre-existing: ${existingConditions || 'None'}
Normalized Symptoms: ${parsedExtraction.normalizedSymptoms.join(', ')}
Duration: ${parsedExtraction.extractedDuration}
Severity Rating: ${severity}/10
${skinImage ? '[Dermatological skin photo attached. Consider visual morphological features like eczema, contact dermatitis, psoriasis, fungal tinea, or urticaria if consistent with the photo].' : ''}

CRITICAL: This is an educational probability estimate, NOT a confirmed diagnosis.`;

      const suggestionsRes = await generateContent({
        model: generationModel,
        contents: suggestionsPrompt,
        responseMimeType: 'application/json',
        responseSchema: CONDITION_SUGGESTION_SCHEMA,
        image: skinImage ? { base64: skinImage.base64, mimeType: skinImage.mimeType } : undefined,
      });

      if (!suggestionsRes.success) {
        throw new Error(suggestionsRes.error || 'Failed condition suggestion estimation.');
      }

      const initialConditions: ConditionSuggestion[] = JSON.parse(suggestionsRes.text);

      // Step 3: RAG Retrieval & Clinical Synthesis per Condition
      setStage('rag');
      const enrichedConditions: ConditionSuggestion[] = [];

      for (const cond of initialConditions) {
        // Query vector store for this condition + patient's specific symptoms
        const ragQuery = `${cond.condition} symptoms precautions warning signs ${parsedExtraction.normalizedSymptoms.join(' ')}`;
        const retrievedPassages = await retrievePassages(ragQuery, {
          embeddingModel,
          topK: 3,
          similarityThreshold,
          rerank: rerankEnabled,
        });

        // Synthesize grounded explanation, precautions, and emergency warning signs
        const synthesisPrompt = `You are Medi-RAG. Synthesize educational guidance for the condition "${cond.condition}" based on the patient's symptoms (${parsedExtraction.normalizedSymptoms.join(', ')}) and the retrieved context passages below.

Context Passages:
${retrievedPassages.map((p, i) => `[Passage ${i + 1}] (${p.chunk.docName}):\n${p.chunk.text}`).join('\n\n')}

Provide:
1. A 2-sentence simple explanation of how this condition may relate to the symptoms.
2. 3 general precautions (as bullet points).
3. 2 recommended next steps (as bullet points).
4. Specific red-flag warning signs when to see a doctor urgently.

Keep language clear, empathetic, and cite passages as [1], [2] if available.`;

        const synthesisRes = await generateContent({
          model: generationModel,
          contents: synthesisPrompt,
          temperature: 0.2,
        });

        const synthText = synthesisRes.success ? synthesisRes.text : cond.reasoning;

        // Parse synthesis into structured sections
        enrichedConditions.push({
          ...cond,
          explanation: synthText,
          citations: retrievedPassages,
        });
      }

      setConditionSuggestions(enrichedConditions);
      setStage('complete');
    } catch (err: unknown) {
      console.error('Symptom pipeline failed:', err);
      setAnalysisError(err instanceof Error ? err.message : String(err));
      setStage('idle');
    }
  };

  // Trigger browser print/pdf export
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Screen Title & Clinical Safety Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            <span>Symptom Checker & Clinical Decision Support</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Combines patient profile extraction, AI probability estimation, and grounded RAG knowledge verification.
          </p>
        </div>

        {stage === 'complete' && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0 print:hidden"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF Report</span>
          </button>
        )}
      </div>

      {analysisError && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {analysisError}</span>
          <button onClick={() => setAnalysisError(null)} className="text-rose-600 font-bold ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Intake Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-6 print:hidden">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">
          1. Patient Profile & Clinical Parameters
        </h2>

        {/* Demographics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Age (Years)
            </label>
            <input
              type="number"
              min="0"
              max="120"
              value={age}
              onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Biological Sex
            </label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as any)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other / Prefer not to say</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Duration
            </label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 3 days, 2 weeks"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={pregnancy}
                onChange={(e) => setPregnancy(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300">
                Currently Pregnant (Optional)
              </span>
            </label>
          </div>
        </div>

        {/* Existing Conditions */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Pre-existing Health Conditions & Medications (Optional)
          </label>
          <input
            type="text"
            value={existingConditions}
            onChange={(e) => setExistingConditions(e.target.value)}
            placeholder="e.g. Hypertension, Diabetes, Asthma, None"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        {/* Common Symptom Chips */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
            Select Common Symptoms:
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_SYMPTOM_CHIPS.map((chip) => {
              const isSelected = selectedChips.includes(chip);
              const isRedFlagChip = chip === 'Chest Pain' || chip === 'Breathlessness';
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(chip)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    isSelected
                      ? isRedFlagChip
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 font-bold'
                        : 'bg-teal-700 text-white dark:bg-teal-600 shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>

        {/* Free-text Symptoms Input */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Describe All Symptoms in Detail:
          </label>
          <textarea
            rows={3}
            value={symptomsText}
            onChange={(e) => setSymptomsText(e.target.value)}
            placeholder="e.g. Red itchy circular patches on arm, rash started 4 days ago with scaling borders, or fever and body aches..."
            className="w-full p-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        {/* Dermatological Skin Picture Input */}
        <ImageCaptureControl
          image={skinImage}
          onImageChange={setSkinImage}
          label="Attach Skin Lesion / Rash Photo (Optional)"
        />

        {/* Severity Slider */}
        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Severity Level Rating (1 to 10):
            </span>
            <span className="font-mono font-bold text-teal-700 dark:text-teal-400 text-sm">
              {severity} / 10 ({severity >= 8 ? 'Severe' : severity >= 5 ? 'Moderate' : 'Mild'})
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Uses Gemini structured output schema & vector search
          </span>
          <button
            type="button"
            onClick={handleAnalyzeSymptoms}
            disabled={stage !== 'idle' && stage !== 'complete'}
            className="px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white font-semibold text-xs shadow-sm transition-colors flex items-center gap-2"
          >
            {stage === 'idle' || stage === 'complete' ? (
              <>
                <span>Run Decision-Support Analysis</span>
                <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>
                  {stage === 'preprocessing' && 'Extracting clinical entities...'}
                  {stage === 'suggesting' && 'Evaluating condition probabilities...'}
                  {stage === 'rag' && 'Retrieving trusted document evidence...'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analysis Results View */}
      {stage === 'complete' && conditionSuggestions.length > 0 && (
        <div className="space-y-6">
          {/* Section Heading */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                2. AI-Estimated Possible Conditions
              </h2>
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                AI-estimated decision-support, not a confirmed clinical diagnosis. Please consult a qualified doctor.
              </p>
            </div>
            {extractedData && (
              <div className="text-xs text-slate-500 font-mono">
                Normalized symptoms: {extractedData.normalizedSymptoms.join(', ')}
              </div>
            )}
          </div>

          {/* Analyzed Skin Photo Banner if attached */}
          {skinImage && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900">
              <div className="w-20 h-20 rounded-lg overflow-hidden border border-teal-300 dark:border-teal-800 bg-black shrink-0 shadow-sm">
                <img
                  src={skinImage.previewUrl}
                  alt="Patient skin condition photo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <span className="text-xs font-bold text-teal-900 dark:text-teal-200 block">
                  Analyzed Dermatological Photo ({skinImage.fileName})
                </span>
                <p className="text-xs text-teal-800 dark:text-teal-300 mt-1 leading-relaxed">
                  Visual lesion morphology, erythema, scaling, and borders were evaluated alongside reported symptoms and clinical dermatological guidelines.
                </p>
              </div>
            </div>
          )}

          {/* Condition Cards */}
          <div className="grid grid-cols-1 gap-6">
            {conditionSuggestions.map((item, index) => {
              const likelihoodColor =
                item.likelihood === 'high'
                  ? 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900'
                  : item.likelihood === 'medium'
                  ? 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900'
                  : 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900';

              return (
                <div
                  key={index}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold flex items-center justify-center text-sm">
                        #{index + 1}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {item.condition}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Matching symptoms: {item.matchingSymptoms.join(', ')}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md border uppercase font-mono self-start sm:self-center ${likelihoodColor}`}
                    >
                      Estimated Likelihood: {item.likelihood}
                    </span>
                  </div>

                  {/* Grounded Clinical Synthesis */}
                  <div className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                    {item.explanation || item.reasoning}
                  </div>

                  {/* Retrieved Citations */}
                  {item.citations && item.citations.length > 0 && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-teal-600" />
                        <span>Source Grounding Passages ({item.citations.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.citations.map((c, cIdx) => (
                          <button
                            key={c.chunk.id}
                            type="button"
                            onClick={() => setSelectedCitation({ result: c, index: cIdx + 1 })}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-teal-400 text-slate-700 dark:text-slate-300 text-left transition-colors cursor-pointer"
                          >
                            <span className="font-bold text-teal-700">[{cIdx + 1}]</span>
                            <span className="truncate max-w-[140px]">{c.chunk.docName}</span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {(c.score * 100).toFixed(0)}%
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                    Always consult a certified medical practitioner to confirm or rule out this condition.
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mandatory Printable Medical Disclaimer */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase tracking-wider block">Legal & Clinical Notice:</span>
                <p className="mt-1 leading-relaxed">{FIXED_MEDICAL_DISCLAIMER}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citation Modal */}
      <CitationModal
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        citation={selectedCitation?.result || null}
        citationIndex={selectedCitation?.index}
      />
    </div>
  );
};
