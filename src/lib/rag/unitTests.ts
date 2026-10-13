import { chunkText, cleanText } from './chunker';
import { cosineSimilarity, l2Normalize } from './cosine';
import { detectRedFlags } from './redFlags';
import { parseSymptomCSV, trainAndEvaluateClassifier, SAMPLE_SYMPTOMS_CSV, seededShuffle, dedupeRows } from '../ml/naiveBayes';
import { rankDiseases, SymptomModelFile } from '../ml/symptomModel';
import { keywordExtract } from '../ml/symptomExtract';
import { bm25Rank, tokenize } from './lexical';
import { StoredChunk } from '../../types';

export interface UnitTestResult {
  name: string;
  category: string;
  passed: boolean;
  message: string;
  details?: string;
}

export function runAllUnitTests(): UnitTestResult[] {
  const results: UnitTestResult[] = [];

  // Test 1: Text Cleaner
  try {
    const raw = 'Hello \r\n world \t\t with   “fancy quotes” and \n\n\n extra lines.';
    const cleaned = cleanText(raw);
    const pass = !cleaned.includes('\r') && cleaned.includes('"fancy quotes"') && !cleaned.includes('\n\n\n');
    results.push({
      name: 'Text Cleaner normalization',
      category: 'Chunker & Preprocessing',
      passed: pass,
      message: pass ? 'Cleaned control chars and normalized quotes correctly' : 'Failed text cleaning',
      details: cleaned,
    });
  } catch (err) {
    results.push({
      name: 'Text Cleaner normalization',
      category: 'Chunker & Preprocessing',
      passed: false,
      message: String(err),
    });
  }

  // Test 2: Chunker boundary and overlap
  try {
    const paragraphText = Array(150).fill('medical symptom fever cough').join(' ') + '\n\n' + Array(150).fill('treatment fluids rest hydration').join(' ');
    const chunks = chunkText(paragraphText, 100, 20);
    const pass = chunks.length >= 2 && chunks[0].wordCount > 50 && chunks.every((c) => c.text.length > 0);
    results.push({
      name: 'Paragraph-aware chunker with overlap',
      category: 'Chunker & Preprocessing',
      passed: pass,
      message: pass ? `Generated ${chunks.length} chunks maintaining paragraph structure` : 'Failed chunk generation',
      details: `Chunk counts: ${chunks.map((c) => c.wordCount).join(', ')} words`,
    });
  } catch (err) {
    results.push({
      name: 'Paragraph-aware chunker with overlap',
      category: 'Chunker & Preprocessing',
      passed: false,
      message: String(err),
    });
  }

  // Test 3: Cosine Similarity Orthogonal & Parallel
  try {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];
    const vecD = [-1, 0, 0];

    const scoreIdentical = cosineSimilarity(vecA, vecB);
    const scoreOrthogonal = cosineSimilarity(vecA, vecC);
    const scoreOpposite = cosineSimilarity(vecA, vecD);

    const pass =
      Math.abs(scoreIdentical - 1.0) < 1e-4 &&
      Math.abs(scoreOrthogonal - 0.0) < 1e-4 &&
      Math.abs(scoreOpposite - -1.0) < 1e-4;

    results.push({
      name: 'Cosine similarity vector math',
      category: 'Vector Retrieval',
      passed: pass,
      message: pass ? 'Identity=1.0, Orthogonal=0.0, Inverted=-1.0 verified' : 'Mathematical deviation detected',
      details: `Identical: ${scoreIdentical.toFixed(3)}, Orthogonal: ${scoreOrthogonal.toFixed(3)}, Opposite: ${scoreOpposite.toFixed(3)}`,
    });
  } catch (err) {
    results.push({
      name: 'Cosine similarity vector math',
      category: 'Vector Retrieval',
      passed: false,
      message: String(err),
    });
  }

  // Test 4: L2 Normalizer Unit Length
  try {
    const unnormalized = [3, 4, 0];
    const normalized = l2Normalize(unnormalized);
    const length = Math.sqrt(normalized.reduce((acc, v) => acc + v * v, 0));
    const pass = Math.abs(length - 1.0) < 1e-4 && Math.abs(normalized[0] - 0.6) < 1e-4;
    results.push({
      name: 'L2 Vector Normalization',
      category: 'Vector Retrieval',
      passed: pass,
      message: pass ? 'Normalized vector length exactly equals 1.0' : 'Normalization error',
      details: `Resulting Euclidean magnitude: ${length.toFixed(4)}`,
    });
  } catch (err) {
    results.push({
      name: 'L2 Vector Normalization',
      category: 'Vector Retrieval',
      passed: false,
      message: String(err),
    });
  }

  // Test 5: Red Flag Detector (High-risk emergencies)
  try {
    const alert1 = detectRedFlags('I have sudden chest pain radiating to left arm and shortness of breath');
    const alert2 = detectRedFlags('Patient reports mild sneezing and running nose');
    const pass = alert1.triggered && !alert2.triggered && alert1.matchedKeywords.includes('chest pain');
    results.push({
      name: 'Emergency Red-Flag rule engine',
      category: 'Clinical Safety',
      passed: pass,
      message: pass ? 'Triggered on acute cardiac red flag, quiet on mild coryza' : 'Red flag safety trigger failed',
      details: `Emergency detected: "${alert1.emergencyType}" with keywords [${alert1.matchedKeywords.join(', ')}]`,
    });
  } catch (err) {
    results.push({
      name: 'Emergency Red-Flag rule engine',
      category: 'Clinical Safety',
      passed: false,
      message: String(err),
    });
  }

  // Test 6: Classical ML Naive Bayes Classifier
  try {
    const dataset = parseSymptomCSV(SAMPLE_SYMPTOMS_CSV);
    const metrics = trainAndEvaluateClassifier(dataset);
    const pass = metrics.accuracy >= 0.5 && metrics.classes.length >= 3 && metrics.confusionMatrix.length > 0;
    results.push({
      name: 'Naive Bayes ML classifier & confusion matrix',
      category: 'Machine Learning',
      passed: pass,
      message: pass ? `Evaluated on ${metrics.sampleCount} test cases. Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%` : 'Classifier failed',
      details: `Classes: ${metrics.classes.join(', ')} | Matrix: ${metrics.confusionMatrix.length}x${metrics.confusionMatrix.length}`,
    });
  } catch (err) {
    results.push({
      name: 'Naive Bayes ML classifier & confusion matrix',
      category: 'Machine Learning',
      passed: false,
      message: String(err),
    });
  }

  const run = (name: string, category: string, fn: () => { pass: boolean; message: string; details?: string }) => {
    try {
      const r = fn();
      results.push({ name, category, passed: r.pass, message: r.message, details: r.details });
    } catch (err) {
      results.push({ name, category, passed: false, message: String(err) });
    }
  };

  // Test 7: seeded shuffle really shuffles and is reproducible
  run('Seeded Fisher-Yates shuffle', 'Machine Learning', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const a = seededShuffle(items, 42);
    const b = seededShuffle(items, 42);
    const same = a.every((v, i) => v === b[i]);
    const moved = a.filter((v, i) => v !== i).length;
    const permutation = [...a].sort((x, y) => x - y).every((v, i) => v === i);
    return {
      pass: same && moved > 25 && permutation,
      message: same && moved > 25 && permutation ? 'Deterministic, a true permutation, and 25+ elements moved' : 'Shuffle is broken',
      details: `moved ${moved}/50 elements`,
    };
  });

  // Test 8: duplicate rows are removed before the train/test split
  run('Dataset de-duplication', 'Machine Learning', () => {
    const d = dedupeRows([
      { features: [1, 0], label: 'A' },
      { features: [1, 0], label: 'A' },
      { features: [1, 0], label: 'B' },
    ]);
    return { pass: d.length === 2, message: d.length === 2 ? 'Identical rows collapsed; same features with another label kept' : 'De-duplication failed' };
  });

  // Test 9: Naive Bayes shortlist scores REPORTED symptoms only and ranks the right disease first
  run('Symptom model ranking', 'Machine Learning', () => {
    const tiny: SymptomModelFile = {
      symptoms: [{ id: 'fever', label: 'fever' }, { id: 'rash', label: 'rash' }, { id: 'cough', label: 'cough' }],
      diseases: ['Dengue', 'Cold'],
      log_priors: [Math.log(0.5), Math.log(0.5)],
      log_p: [
        [Math.log(0.9), Math.log(0.8), Math.log(0.1)],
        [Math.log(0.3), Math.log(0.05), Math.log(0.9)],
      ],
    };
    const top = rankDiseases(tiny, ['fever', 'rash'], 2);
    const ok = top[0]?.disease === 'Dengue' && top[0].strength > top[1].strength && top[0].strength <= 1;
    const none = rankDiseases(tiny, [], 2).length === 0;
    return { pass: ok && none, message: ok && none ? 'Dengue ranked first for fever + rash; empty input returns nothing' : 'Ranking failed', details: top.map((t) => `${t.disease}:${t.strength.toFixed(2)}`).join(', ') };
  });

  // Test 10: keyword symptom extraction
  run('Keyword symptom extraction', 'Machine Learning', () => {
    const model: SymptomModelFile = {
      symptoms: ['high_fever', 'headache', 'skin_rash', 'pain_behind_the_eyes', 'mild_fever'].map((id) => ({ id, label: id.replace(/_/g, ' ') })),
      diseases: [], log_priors: [], log_p: [],
    };
    const got = keywordExtract('High fever, bad headache and a rash with pain behind the eyes', model).sort();
    const want = ['headache', 'high_fever', 'pain_behind_the_eyes', 'skin_rash'];
    const pass = JSON.stringify(got) === JSON.stringify(want);
    return { pass, message: pass ? 'Mapped plain English to the 4 expected symptom ids' : 'Extraction mismatch', details: got.join(', ') };
  });

  // Test 11: BM25 keyword retrieval (works with no API key)
  run('BM25 keyword retrieval', 'Vector Retrieval', () => {
    const mk = (id: string, text: string): StoredChunk => ({ id, docId: id, docName: id, page: 1, text, vector: [], embeddingModel: '', trustedSource: 't', wordCount: text.split(' ').length });
    const chunks = [
      mk('dengue', 'Dengue spreads through the bite of an infected mosquito and causes high fever and joint pain'),
      mk('diabetes', 'Diabetes affects how the body uses blood sugar insulin and food energy'),
      mk('asthma', 'Asthma narrows the airways and causes wheezing and shortness of breath'),
    ];
    const hits = bm25Rank('how do mosquito bites spread dengue', chunks, 2);
    const stems = tokenize('mosquitoes bites spreading').join(',');
    const pass = hits[0]?.chunk.id === 'dengue' && stems === 'mosquito,bite,spread';
    return { pass, message: pass ? 'Dengue passage ranked first; stemming works' : 'Keyword ranking failed', details: `top: ${hits[0]?.chunk.id}; stems: ${stems}` };
  });

  return results;
}
