import React from 'react';
import { Info, AlertTriangle, Stethoscope, Search, Database, Sparkles, ShieldCheck } from 'lucide-react';
import { FIXED_MEDICAL_DISCLAIMER } from '../constants';

const STEPS = [
  { icon: <Stethoscope className="w-5 h-5" />, title: '1. Symptoms in', text: 'You pick symptoms or describe them in your own words (any language). Emergency phrases are checked first, by plain code.' },
  { icon: <Search className="w-5 h-5" />, title: '2. ML shortlist', text: 'A small Naive Bayes model, trained on a public 41-disease dataset, ranks up to three possible conditions. It runs in your browser and costs nothing.' },
  { icon: <Database className="w-5 h-5" />, title: '3. Trusted text', text: 'For each condition we fetch passages from MedlinePlus (U.S. National Library of Medicine), plus any documents you added.' },
  { icon: <Sparkles className="w-5 h-5" />, title: '4. Plain-language explanation', text: 'Gemini explains the shortlist using only those passages, with tappable [n] citations. It may not add new diagnoses.' },
  { icon: <ShieldCheck className="w-5 h-5" />, title: '5. Safety layer', text: 'Disclaimer on every result, "possible match" wording, no doses, and a clear refusal when sources do not cover the question.' },
];

export const AboutScreen: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 md:py-8 space-y-6">
      <div>
        <span className="kicker">Read me first</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-[1.05] mt-1 flex items-center gap-2">
          <Info className="w-8 h-8 text-teal-600 shrink-0" aria-hidden="true" />
          <span>About and safety</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">An educational prototype that combines a symptom model, trusted retrieval and an LLM that explains.</p>
      </div>

      <div className="p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 text-amber-950 dark:text-amber-100 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
          <h2 className="text-lg font-bold">Not medical advice</h2>
        </div>
        <p className="text-sm leading-relaxed font-semibold">{FIXED_MEDICAL_DISCLAIMER}</p>
        <p className="text-sm leading-relaxed">
          Medi-RAG does not replace a doctor. If you suspect an emergency (chest pain, severe breathing trouble, stroke signs, heavy bleeding, thoughts of self-harm), call 112, 911, 108 or your local emergency number now.
        </p>
      </div>

      <section aria-labelledby="how">
        <h2 id="how" className="text-2xl font-extrabold mb-3">How it works</h2>
        <ol className="grid gap-3">
          {STEPS.map((s) => (
            <li key={s.title} className="card p-4 flex gap-3">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-lime-400 text-slate-900 border-[1.5px] border-slate-900 flex items-center justify-center" aria-hidden="true">{s.icon}</span>
              <div>
                <h3 className="font-extrabold">{s.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5 space-y-3" aria-labelledby="limits">
        <h2 id="limits" className="text-2xl font-extrabold">Known limitations</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
          <li><b>Synthetic training data.</b> The symptom dataset is public and repetitive, so even high test scores say little about real patients. See the Test Lab for honest numbers by how many symptoms are reported.</li>
          <li><b>Match strength is not a probability.</b> The bars rank conditions against each other; Naive Bayes is overconfident, so we scale it down.</li>
          <li><b>Only 41 conditions</b> are in the symptom model, and the built-in library is 40 short MedlinePlus pages. Many illnesses are simply not covered.</li>
          <li><b>No clinical validation.</b> This has not been tested on patients or reviewed by clinicians.</li>
          <li><b>Photos are experimental.</b> They are sent to Gemini only for that question, are not diagnostic and are not used by the symptom model.</li>
          <li><b>The LLM can still be wrong.</b> That is why every claim links to its source passage.</li>
        </ul>
      </section>

      <section className="card p-5 space-y-3" aria-labelledby="privacy">
        <h2 id="privacy" className="text-2xl font-extrabold">Privacy</h2>
        <p className="text-sm leading-relaxed">
          Your uploaded documents, their text and vectors stay in this browser (IndexedDB). The Gemini key stays on the server. Text you ask about, and the passages retrieved for it, are sent to Google Gemini to write an answer.
        </p>
      </section>
    </div>
  );
};
