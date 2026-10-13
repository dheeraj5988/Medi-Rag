// Centralized model names and RAG parameters
export const GENERATION_MODEL = 'gemini-3.8-flash';
export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const ALT_EMBEDDING_MODEL = 'gemini-embedding-001';

export const AVAILABLE_GENERATION_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Flagship)', description: 'Fast, high-fidelity clinical synthesis' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Ultra Reliable)', description: 'High quota & low latency' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', description: 'Lowest latency & high quota' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Latest stable Flash iteration' },
];

export const AVAILABLE_EMBEDDING_MODELS = [
  { id: 'gemini-embedding-2', name: 'gemini-embedding-2 (768-dim, Normalized)', dimension: 768 },
  { id: 'gemini-embedding-001', name: 'gemini-embedding-001 (Legacy, RETRIEVAL_DOCUMENT)', dimension: 768 },
];

export const DEFAULT_TOP_K = 5;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.35;
export const DEFAULT_RERANK_ENABLED = true;
export const DEFAULT_CHUNK_SIZE_WORDS = 300;
export const DEFAULT_CHUNK_OVERLAP_WORDS = 40;

export const FIXED_MEDICAL_DISCLAIMER =
  'This is educational information, not a medical diagnosis. Please consult a qualified doctor. In an emergency contact your local emergency number.';

export const PRIVACY_ASSURANCE =
  'Medi-RAG Privacy Guarantee: All uploaded documents, text chunks, and embedding vectors remain locally inside your browser (IndexedDB). Only the query and retrieved context passages are sent to Gemini for clinical synthesis.';

export const SAMPLE_DOCS_BANNER_TEXT =
  'You are currently using preloaded SAMPLE documents (Common Cold, Influenza, Dengue). For authoritative clinical decision support, please upload real verified medical guidelines (e.g. WHO, CDC, NHS, MedlinePlus) in the Knowledge Base.';
