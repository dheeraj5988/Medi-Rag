import { MLMetrics } from '../../types';

export interface DatasetRow {
  features: number[];
  label: string;
}

export interface ParsedCSVDataset {
  featureNames: string[];
  labelName: string;
  rows: DatasetRow[];
}

export class BernoulliNaiveBayes {
  private classes: string[] = [];
  private classPriors: Record<string, number> = {};
  private featureProbs: Record<string, number[]> = {}; // P(feature_j = 1 | class)
  private numFeatures: number = 0;

  /**
   * Train Bernoulli Naive Bayes with Laplace smoothing (+1)
   */
  train(rows: DatasetRow[], numFeatures: number) {
    this.numFeatures = numFeatures;
    const classCounts: Record<string, number> = {};
    const classFeatureCounts: Record<string, number[]> = {};

    for (const r of rows) {
      classCounts[r.label] = (classCounts[r.label] || 0) + 1;
      if (!classFeatureCounts[r.label]) {
        classFeatureCounts[r.label] = new Array(numFeatures).fill(0);
      }
      for (let j = 0; j < numFeatures; j++) {
        if (r.features[j] === 1) {
          classFeatureCounts[r.label][j]++;
        }
      }
    }

    this.classes = Object.keys(classCounts);
    const totalSamples = rows.length;

    for (const c of this.classes) {
      // Prior with Laplace smoothing
      this.classPriors[c] = Math.log((classCounts[c] + 1) / (totalSamples + this.classes.length));
      this.featureProbs[c] = new Array(numFeatures).fill(0);

      // Feature probabilities P(X_j = 1 | C) with Laplace smoothing
      for (let j = 0; j < numFeatures; j++) {
        const count = classFeatureCounts[c][j];
        this.featureProbs[c][j] = (count + 1) / (classCounts[c] + 2);
      }
    }
  }

  /**
   * Predict single sample
   */
  predict(features: number[]): string {
    let bestClass = this.classes[0] || 'Unknown';
    let maxLogProb = -Infinity;

    for (const c of this.classes) {
      let logProb = this.classPriors[c];
      const probs = this.featureProbs[c];

      for (let j = 0; j < this.numFeatures; j++) {
        const p = probs[j];
        if (features[j] === 1) {
          logProb += Math.log(p);
        } else {
          logProb += Math.log(1 - p);
        }
      }

      if (logProb > maxLogProb) {
        maxLogProb = logProb;
        bestClass = c;
      }
    }

    return bestClass;
  }
}

/**
 * Parse CSV text into binary feature vectors and string labels
 */
export function parseSymptomCSV(csvText: string): ParsedCSVDataset {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV must contain a header and at least one data row.');
  }

  const header = lines[0].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
  const labelColIndex = header.findIndex(
    (col) =>
      col.toLowerCase() === 'prognosis' ||
      col.toLowerCase() === 'label' ||
      col.toLowerCase() === 'condition' ||
      col.toLowerCase() === 'disease'
  );

  const targetLabelIndex = labelColIndex !== -1 ? labelColIndex : header.length - 1;
  const featureNames = header.filter((_, idx) => idx !== targetLabelIndex);
  const labelName = header[targetLabelIndex];

  const rows: DatasetRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < header.length) continue;

    const label = cols[targetLabelIndex];
    const features: number[] = [];

    for (let j = 0; j < cols.length; j++) {
      if (j === targetLabelIndex) continue;
      const num = Number(cols[j]);
      features.push(num >= 0.5 ? 1 : 0);
    }

    if (label) {
      rows.push({ features, label });
    }
  }

  return {
    featureNames,
    labelName,
    rows,
  };
}

/** Small seeded PRNG (mulberry32) so the shuffle is real but reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle with a seeded PRNG. (The original used sort(() => constant), which never shuffled.) */
export function seededShuffle<T>(items: T[], seed = 42): T[] {
  const rand = seededRandom(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Remove duplicate (features, label) rows so identical rows cannot appear in both train and test. */
export function dedupeRows(rows: DatasetRow[]): DatasetRow[] {
  const seen = new Set<string>();
  const out: DatasetRow[] = [];
  for (const r of rows) {
    const key = `${r.label}|${r.features.join('')}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/**
 * Train and evaluate Naive Bayes on an 80/20 split of UNIQUE rows (seeded shuffle, deterministic).
 */
export function trainAndEvaluateClassifier(dataset: ParsedCSVDataset): MLMetrics {
  const { featureNames } = dataset;
  const rows = dedupeRows(dataset.rows);
  if (rows.length < 5) {
    throw new Error('At least 5 unique samples are required to train and evaluate.');
  }

  const shuffled = seededShuffle(rows, 42);
  const trainSize = Math.max(1, Math.floor(shuffled.length * 0.8));
  const trainSet = shuffled.slice(0, trainSize);
  const testSet = shuffled.slice(trainSize);

  const model = new BernoulliNaiveBayes();
  model.train(trainSet, featureNames.length);

  // Collect unique classes
  const classes = Array.from(new Set(rows.map((r) => r.label))).sort();
  const classIndexMap = new Map(classes.map((c, i) => [c, i]));

  // Initialize confusion matrix [actual][predicted]
  const confusionMatrix: number[][] = classes.map(() => new Array(classes.length).fill(0));

  let correct = 0;

  for (const sample of testSet) {
    const pred = model.predict(sample.features);
    const actualIdx = classIndexMap.get(sample.label) ?? -1;
    const predIdx = classIndexMap.get(pred) ?? -1;

    if (actualIdx !== -1 && predIdx !== -1) {
      confusionMatrix[actualIdx][predIdx]++;
    }

    if (pred === sample.label) {
      correct++;
    }
  }

  const accuracy = testSet.length > 0 ? correct / testSet.length : 0;

  // Calculate Precision, Recall, F1 per class
  const precision: Record<string, number> = {};
  const recall: Record<string, number> = {};
  const f1: Record<string, number> = {};

  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    const tp = confusionMatrix[i][i];
    let fp = 0;
    let fn = 0;

    for (let row = 0; row < classes.length; row++) {
      if (row !== i) fp += confusionMatrix[row][i];
    }
    for (let col = 0; col < classes.length; col++) {
      if (col !== i) fn += confusionMatrix[i][col];
    }

    const p = tp + fp > 0 ? tp / (tp + fp) : 1;
    const r = tp + fn > 0 ? tp / (tp + fn) : 1;
    precision[c] = Number(p.toFixed(3));
    recall[c] = Number(r.toFixed(3));
    f1[c] = p + r > 0 ? Number(((2 * p * r) / (p + r)).toFixed(3)) : 0;
  }

  return {
    accuracy: Number(accuracy.toFixed(3)),
    sampleCount: testSet.length,
    trainCount: trainSet.length,
    uniqueRows: rows.length,
    totalRows: dataset.rows.length,
    classes,
    confusionMatrix,
    precision,
    recall,
    f1,
  };
}

/**
 * Preloaded Sample Symptom CSV for testing
 */
export const SAMPLE_SYMPTOMS_CSV = `fever,cough,sore_throat,body_ache,headache,retro_orbital_pain,rash,loss_of_smell,nausea,fatigue,prognosis
1,1,1,0,1,0,0,0,0,1,Common Cold
0,1,1,0,0,0,0,0,0,0,Common Cold
1,1,1,0,1,0,0,0,0,1,Common Cold
0,1,1,0,0,0,0,0,0,1,Common Cold
0,1,1,0,1,0,0,0,0,0,Common Cold
1,1,0,1,1,0,0,0,1,1,Influenza
1,1,1,1,1,0,0,0,0,1,Influenza
1,1,0,1,1,0,0,0,0,1,Influenza
1,1,1,1,1,0,0,0,1,1,Influenza
1,0,0,1,1,0,0,0,1,1,Influenza
1,0,0,1,1,1,1,0,1,1,Dengue
1,0,0,1,1,1,1,0,1,1,Dengue
1,0,0,1,1,1,0,0,1,1,Dengue
1,0,0,1,1,1,1,0,0,1,Dengue
1,0,0,1,1,1,1,0,1,1,Dengue
0,0,0,0,0,0,0,1,0,1,COVID-19 Mild
1,1,1,0,1,0,0,1,0,1,COVID-19 Mild
0,1,0,0,0,0,0,1,0,0,COVID-19 Mild
1,1,0,0,1,0,0,1,0,1,COVID-19 Mild
0,0,1,0,0,0,0,1,0,0,COVID-19 Mild
0,0,0,0,0,0,0,0,1,0,Gastroenteritis
1,0,0,1,0,0,0,0,1,1,Gastroenteritis
0,0,0,0,0,0,0,0,1,1,Gastroenteritis
1,0,0,0,1,0,0,0,1,1,Gastroenteritis
0,0,0,0,0,0,0,0,1,0,Gastroenteritis`;
