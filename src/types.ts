export interface StoredDocument {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  chunkCount: number;
  dateAdded: string;
  trustedSource: string;
  isSample: boolean;
}

export interface StoredChunk {
  id: string;
  docId: string;
  docName: string;
  page: number;
  text: string;
  vector: number[];
  embeddingModel: string;
  trustedSource: string;
  wordCount: number;
}

export interface RetrievalResult {
  chunk: StoredChunk;
  score: number;
  rerankScore?: number;
}

export interface ChatCitation {
  index: number;
  chunkId: string;
  docName: string;
  page: number;
  trustedSource: string;
  snippet: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: RetrievalResult[];
  isGeneralKnowledge?: boolean;
  isError?: boolean;
  modelUsed?: string;
  fallbackNotice?: string;
  image?: {
    base64: string;
    mimeType: string;
    fileName?: string;
  };
}

export interface PatientProfile {
  age: number | '';
  sex: 'female' | 'male' | 'other' | '';
  pregnancy?: boolean;
  existingConditions?: string;
  symptomsText: string;
  duration: string;
  severity: number;
  selectedCommonChips: string[];
  image?: {
    base64: string;
    mimeType: string;
    fileName?: string;
  };
}

export interface ExtractedSymptoms {
  normalizedSymptoms: string[];
  extractedDuration: string;
  extractedSeverity: string;
  keyConcerns: string[];
}

export interface ConditionSuggestion {
  condition: string;
  likelihood: 'low' | 'medium' | 'high';
  matchingSymptoms: string[];
  reasoning: string;
  explanation?: string;
  precautions?: string[];
  nextSteps?: string[];
  whenToSeeDoctorUrgently?: string;
  citations?: RetrievalResult[];
}

export interface RedFlagAlert {
  triggered: boolean;
  emergencyType: string;
  matchedKeywords: string[];
  immediateAction: string;
}

export interface ConnectionTestResult {
  generationPass: boolean;
  generationLatency: number;
  generationModel: string;
  embeddingPass: boolean;
  embeddingLatency: number;
  embeddingModel: string;
  error?: string;
}

export interface RetrievalBenchmarkItem {
  id: string;
  query: string;
  expectedKeywords: string[];
  results?: RetrievalResult[];
  hitAt1?: boolean;
  hitAtK?: boolean;
  avgScore?: number;
}

export interface QualityBenchmarkItem {
  id: string;
  query: string;
  answer?: string;
  sources?: RetrievalResult[];
  supportedClaims?: string[];
  unsupportedClaims?: string[];
  groundednessScore?: number;
  running?: boolean;
}

export interface ModelComparisonResult {
  model: string;
  answer: string;
  latency: number;
  citationCount: number;
  error?: string;
}

export interface MLMetrics {
  accuracy: number;
  sampleCount: number;
  classes: string[];
  confusionMatrix: number[][];
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1: Record<string, number>;
}
