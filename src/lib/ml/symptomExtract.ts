import { Type } from '@google/genai';
import { generateContent } from '../gemini/client';
import { SymptomModelFile } from './symptomModel';

/** Plain-English phrase -> model symptom id(s). Deterministic fallback when no LLM is available. */
const ALIASES: Array<[RegExp, string[]]> = [
  [/\bfever\b|temperature/, ['high_fever']],
  [/\b(low|mild|slight|low-grade)\b.{0,12}\bfever\b/, ['mild_fever']],
  [/\bcough/, ['cough']],
  [/sore throat|throat (pain|irritation)|scratchy throat/, ['throat_irritation']],
  [/runny nose|running nose/, ['runny_nose']],
  [/blocked nose|stuffy|congest/, ['congestion']],
  [/sneez/, ['continuous_sneezing']],
  [/body ?(pain|ache)s?|muscle (pain|ache)|aching/, ['muscle_pain']],
  [/joint (pain|ache)/, ['joint_pain']],
  [/head ?ache|migraine/, ['headache']],
  [/nause/, ['nausea']],
  [/vomit|throwing up|throw up/, ['vomiting']],
  [/diarr?hoea|diarrhea|loose (motion|stool)/, ['diarrhoea']],
  [/tired|fatigue|exhaust|lethargic/, ['fatigue']],
  [/weakness|feel weak/, ['malaise']],
  [/\brash/, ['skin_rash']],
  [/itch/, ['itching']],
  [/chest (pain|tightness)/, ['chest_pain']],
  [/short(ness)? of breath|breathless|trouble breathing|difficulty (in )?breathing|can'?t breathe/, ['breathlessness']],
  [/stomach (pain|ache)/, ['stomach_pain']],
  [/abdominal pain|belly (pain|ache)|tummy/, ['abdominal_pain', 'belly_pain']],
  [/chills/, ['chills']],
  [/shiver/, ['shivering']],
  [/sweat/, ['sweating']],
  [/dizz/, ['dizziness']],
  [/yellow(ing)? (of )?(the )?skin/, ['yellowish_skin']],
  [/yellow(ing)? (of )?(the )?eyes/, ['yellowing_of_eyes']],
  [/dark urine/, ['dark_urine']],
  [/burning (urination|micturition|while urinating|when urinating)|painful urination/, ['burning_micturition']],
  [/weight loss|losing weight/, ['weight_loss']],
  [/weight gain/, ['weight_gain']],
  [/loss of appetite|no appetite|not hungry/, ['loss_of_appetite']],
  [/constipat/, ['constipation']],
  [/blood in (the )?stool|bloody stool/, ['bloody_stool']],
  [/back pain/, ['back_pain']],
  [/neck pain/, ['neck_pain']],
  [/stiff neck/, ['stiff_neck']],
  [/knee pain/, ['knee_pain']],
  [/phlegm|mucus/, ['phlegm']],
  [/blood in (the )?(sputum|phlegm)|coughing (up )?blood/, ['blood_in_sputum']],
  [/palpitation|racing heart|fast heart/, ['palpitations', 'fast_heart_rate']],
  [/blurred vision|blurry vision/, ['blurred_and_distorted_vision']],
  [/red eyes|redness of (the )?eyes/, ['redness_of_eyes']],
  [/pain behind (the )?eyes|retro-?orbital/, ['pain_behind_the_eyes']],
  [/swollen (glands|lymph)/, ['swelled_lymph_nodes']],
  [/loss of smell|can'?t smell/, ['loss_of_smell']],
  [/unconscious|coma/, ['coma']],
  [/slurred speech/, ['slurred_speech']],
  [/one side.{0,15}weak|weak.{0,15}one side/, ['weakness_of_one_body_side']],
  [/excessive thirst|very thirsty|frequent urination|urinating a lot/, ['polyuria']],
  [/pimples?|acne/, ['pus_filled_pimples']],
  [/blackheads?/, ['blackheads']],
  [/vertigo|spinning/, ['spinning_movements']],
  [/acidity|acid reflux|heartburn/, ['acidity']],
  [/blister/, ['blister']],
  [/bruis/, ['bruising']],
  [/swollen legs|leg swelling/, ['swollen_legs']],
  [/anxi/, ['anxiety']],
  [/depress/, ['depression']],
  [/mood swing/, ['mood_swings']],
];

export function keywordExtract(text: string, model: SymptomModelFile): string[] {
  const t = ` ${(text || '').toLowerCase()} `;
  const known = new Set(model.symptoms.map((s) => s.id));
  const found = new Set<string>();
  for (const [re, ids] of ALIASES) if (re.test(t)) ids.forEach((id) => known.has(id) && found.add(id));
  // "mild fever" must not also trigger high_fever
  if (found.has('mild_fever') && !/\b(high|severe|very)\b/.test(t)) found.delete('high_fever');
  // the dataset's own symptom names written out as a phrase ("pain behind the eyes")
  for (const s of model.symptoms) {
    const words = s.id.split('_').filter(Boolean);
    if (words.length >= 2 && new RegExp('\\b' + words.join('\\W+(?:\\w+\\W+)?') + '\\b').test(t)) found.add(s.id);
  }
  return Array.from(found);
}

export interface ExtractionResult {
  ids: string[];
  usedLLM: boolean;
  warning?: string;
}

/**
 * Free text -> symptom ids. ONE Gemini structured-output call whose items are restricted to the model's
 * symptom-id enum (anything else is discarded), unioned with the deterministic keyword matcher.
 */
export async function extractSymptomIds(
  text: string,
  model: SymptomModelFile,
  opts: { useLLM: boolean; generationModel: string }
): Promise<ExtractionResult> {
  const keyword = keywordExtract(text, model);
  if (!text.trim() || !opts.useLLM) return { ids: keyword, usedLLM: false };

  const valid = new Set(model.symptoms.map((s) => s.id));
  const res = await generateContent({
    model: opts.generationModel,
    contents:
      `Map this patient description (any language) to symptom ids from the allowed list. ` +
      `Return only symptoms the patient actually reports.\n\nDescription: """${text.slice(0, 1500)}"""`,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: { type: Type.STRING, enum: model.symptoms.map((s) => s.id) },
    },
    temperature: 0,
  });

  if (!res.success) {
    return { ids: keyword, usedLLM: false, warning: `AI symptom mapping unavailable (${res.error}). Used keyword matching.` };
  }
  try {
    const parsed: unknown = JSON.parse(res.text);
    const llmIds = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && valid.has(x)) : [];
    return { ids: Array.from(new Set([...keyword, ...llmIds])), usedLLM: true };
  } catch {
    return { ids: keyword, usedLLM: false, warning: 'AI symptom mapping returned invalid data. Used keyword matching.' };
  }
}
