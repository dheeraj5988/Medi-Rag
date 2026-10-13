/**
 * Symptom -> disease shortlist (Naive Bayes).
 * Model file: public/model/symptom_model.json, generated from the public 41-disease symptom dataset.
 *
 * score[d] = log prior[d]
 *          + sum over REPORTED symptoms j of log P(j | d)
 *          + absence_weight * sum over NOT-reported symptoms j of log(1 - P(j | d))
 *
 * Reported symptoms carry full weight. Unreported ones are treated as mostly "unknown" (weight 0.1, chosen on
 * held-out data), which suits partial real-world reports yet lets a missing typical symptom count a little.
 */
export interface SymptomModelFile {
  symptoms: Array<{ id: string; label: string }>;
  diseases: string[];
  log_priors: number[];
  log_p: number[][]; // [disease][symptom] = log P(symptom | disease)
  absence_weight?: number;
}

export interface RankedDisease {
  disease: string;
  /**
   * 0..1 bar length RELATIVE TO THE BEST MATCH (the best is always 1.0). It is NOT a probability of disease.
   * (Raw Naive Bayes posteriors are overconfident, so we never show them.)
   */
  strength: number;
  /** strong = clear lead over the runner-up; weak = several conditions fit about equally well */
  strengthLabel: 'strong' | 'moderate' | 'weak';
  /** score gap (in nats) to the best match; 0 for the leader */
  gap: number;
  matched: string[];
  toCheck: string[];
}

let cache: Promise<SymptomModelFile> | null = null;

export function loadSymptomModel(): Promise<SymptomModelFile> {
  if (!cache) {
    cache = fetch('/model/symptom_model.json').then((r) => {
      if (!r.ok) throw new Error(`Symptom model not found (HTTP ${r.status})`);
      return r.json();
    });
    cache.catch(() => (cache = null)); // allow retry after a failure
  }
  return cache;
}

/** Display temperature for the relative bar: exp(-gap / T). */
export const DISPLAY_TEMPERATURE = 3;

const absenceCache = new WeakMap<SymptomModelFile, number[][]>();
/** log(1 - P(symptom | disease)), computed once per model. */
function logAbsent(model: SymptomModelFile): number[][] {
  let c = absenceCache.get(model);
  if (!c) {
    c = model.log_p.map((row) => row.map((lp) => Math.log(Math.max(1e-9, 1 - Math.exp(lp)))));
    absenceCache.set(model, c);
  }
  return c;
}

export function scoreAll(model: SymptomModelFile, reportedIds: string[]): number[] {
  const reported = new Set(reportedIds.map((id) => model.symptoms.findIndex((s) => s.id === id)).filter((i) => i >= 0));
  const w = model.absence_weight ?? 0;
  const la = w > 0 ? logAbsent(model) : null;
  return model.diseases.map((_, d) => {
    let s = model.log_priors[d];
    for (let j = 0; j < model.symptoms.length; j++) {
      if (reported.has(j)) s += model.log_p[d][j];
      else if (la) s += w * la[d][j];
    }
    return s;
  });
}

export function rankDiseases(model: SymptomModelFile, reportedIds: string[], topK = 3): RankedDisease[] {
  const idx = reportedIds.map((id) => model.symptoms.findIndex((s) => s.id === id)).filter((i) => i >= 0);
  if (idx.length === 0) return [];

  const scores = scoreAll(model, reportedIds);
  const order = scores.map((_, d) => d).sort((a, b) => scores[b] - scores[a]);
  const best = scores[order[0]];
  const runnerUp = order.length > 1 ? scores[order[1]] : -Infinity;

  return order.slice(0, topK).map((d, rank) => {
    const gap = best - scores[d];
    const margin = best - runnerUp;
    const strengthLabel: RankedDisease['strengthLabel'] =
      rank === 0 ? (margin >= 4 ? 'strong' : margin >= 2 ? 'moderate' : 'weak') : gap <= 2 ? 'moderate' : 'weak';
    const p = (j: number) => Math.exp(model.log_p[d][j]);
    const matched = idx.filter((j) => p(j) >= 0.3).map((j) => model.symptoms[j].label);
    const toCheck = model.symptoms
      .map((s, j) => ({ label: s.label, j, p: p(j) }))
      .filter((x) => !idx.includes(x.j) && x.p >= 0.5)
      .sort((a, b) => b.p - a.p)
      .slice(0, 5)
      .map((x) => x.label);
    return {
      disease: model.diseases[d],
      strength: Math.exp(-gap / DISPLAY_TEMPERATURE),
      strengthLabel,
      gap,
      matched,
      toCheck,
    };
  });
}
