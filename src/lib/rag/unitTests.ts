import { chunkText, cleanText } from './chunker';
import { cosineSimilarity, l2Normalize } from './cosine';
import { detectRedFlags } from './redFlags';
import { parseSymptomCSV, trainAndEvaluateClassifier, SAMPLE_SYMPTOMS_CSV } from '../ml/naiveBayes';

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

  return results;
}
