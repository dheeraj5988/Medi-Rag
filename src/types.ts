export interface StoredDocument {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  chunkCount: number;
  dateAdded: string;
  trustedSource: string;
  isSample: boolean;
  /** Shipped with the app (MedlinePlus public-domain pages) rather than uploaded by the user. */
  isBuiltIn?: boolean;
  url?: string;
  /** Diseases (clean names) this page covers; used for disease-filtered retrieval. */
  covers?: string[];
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
  url?: string;
  covers?: string[];
}

export interface RetrievalResult {
  chunk: StoredChunk;
  score: number;
  rerankScore?: number;
  /** How this passage was found: embedding similarity, keyword (BM25) ranking, or disease-filtered ranking. */
  method?: 'vector' | 'lexical' | 'disease-filter';
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
  /** 0..1 bar length relative to the best match (the best is 1.0). NOT a probability of disease. */
  strength: number;
  strengthLabel: 'strong' | 'moderate' | 'weak';
  matchingSymptoms: string[];
  /** Typical symptoms of this condition the user did not report ("Do you also have...?"). */
  toCheck: string[];
  explanation?: string;
  precautions?: string[];
  nextSteps?: string[];
  urgentSigns?: string[];
  /** Passages used for grounding, each with its global [n] number in the synthesis prompt. */
  citations?: Array<RetrievalResult & { number: number }>;
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
  /** Substring of the document title the top-1 passage should come from. */
  expectedSource?: string;
  results?: RetrievalResult[];
  hitAt1?: boolean;
  hitAtK?: boolean;
  docHitAt1?: boolean;
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
  trainCount?: number;
  uniqueRows?: number;
  totalRows?: number;
  classes: string[];
  confusionMatrix: number[][];
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1: Record<string, number>;
}
