import { GENERATION_MODEL, EMBEDDING_MODEL } from '../../constants';
import { ConnectionTestResult } from '../../types';

export interface GenerateOptions {
  model?: string;
  contents: string | object;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: object;
  temperature?: number;
  image?: {
    base64: string;
    mimeType: string;
  };
}

export interface GenerateResult {
  success: boolean;
  text: string;
  modelUsed: string;
  fallbackOccurred?: boolean;
  latency?: number;
  error?: string;
  code?: string;
}

export interface EmbedResult {
  success: boolean;
  embeddings: number[][];
  modelUsed: string;
  dimension: number;
  error?: string;
  code?: string;
}

/** Counts real Gemini requests so the app (and the Test Lab) can show how many one analysis used. */
export const callCounter = { total: 0, generate: 0, stream: 0, embed: 0, rerank: 0 };
export function resetCallCounter(): void {
  callCounter.total = callCounter.generate = callCounter.stream = callCounter.embed = callCounter.rerank = 0;
}
function countCall(kind: 'generate' | 'stream' | 'embed' | 'rerank'): void {
  callCounter[kind]++;
  callCounter.total++;
}

export interface ServerHealth {
  reachable: boolean;
  hasApiKey: boolean;
}

let healthCache: { at: number; value: ServerHealth } | null = null;

/** Is the server up, and does it have a Gemini key? (cached for 20 s) */
export async function fetchHealth(force = false): Promise<ServerHealth> {
  if (!force && healthCache && Date.now() - healthCache.at < 20000) return healthCache.value;
  let value: ServerHealth = { reachable: false, hasApiKey: false };
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const d = await res.json();
      value = { reachable: true, hasApiKey: Boolean(d.hasApiKey) };
    }
  } catch {
    // server unreachable
  }
  healthCache = { at: Date.now(), value };
  return value;
}

/**
 * Fetch available Gemini models from the server
 */
export async function fetchAvailableModels(): Promise<{
  models: Array<{ name: string; displayName?: string }>;
  defaultGenerationModel: string;
  defaultEmbeddingModel: string;
}> {
  try {
    const res = await fetch('/api/gemini/models');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return {
      models: data.models || [],
      defaultGenerationModel: data.defaultGenerationModel || GENERATION_MODEL,
      defaultEmbeddingModel: data.defaultEmbeddingModel || EMBEDDING_MODEL,
    };
  } catch (err) {
    console.warn('Failed to fetch models from API, falling back to defaults:', err);
    return {
      models: [
        { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
        { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite' },
        { name: 'gemini-flash-latest', displayName: 'Gemini Flash Latest' },
      ],
      defaultGenerationModel: GENERATION_MODEL,
      defaultEmbeddingModel: EMBEDDING_MODEL,
    };
  }
}

/**
 * Generate text or structured JSON from Gemini with automatic fallback
 */
export async function generateContent(options: GenerateOptions): Promise<GenerateResult> {
  countCall('generate');
  try {
    const res = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        text: '',
        modelUsed: options.model || GENERATION_MODEL,
        error: data.error || `HTTP ${res.status} error occurred`,
        code: data.code || 'UNKNOWN_ERROR',
      };
    }

    return {
      success: true,
      text: data.text,
      modelUsed: data.modelUsed,
      fallbackOccurred: data.fallbackOccurred,
      latency: data.latency,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      text: '',
      modelUsed: options.model || GENERATION_MODEL,
      error: `Network failure: ${msg}`,
      code: 'NETWORK_ERROR',
    };
  }
}

/**
 * Stream text from Gemini using Server-Sent Events
 */
export async function streamContent(
  options: GenerateOptions,
  callbacks: {
    onStart?: (modelUsed: string, fallback: boolean) => void;
    onChunk: (text: string) => void;
    onDone: (modelUsed: string) => void;
    onError: (errorMessage: string, code?: string) => void;
    onFallbackNotice?: (message: string) => void;
  }
): Promise<void> {
  countCall('stream');
  try {
    const res = await fetch('/api/gemini/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      callbacks.onError(errJson.error || `Stream failed with HTTP ${res.status}`, errJson.code);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError('ReadableStream not supported by browser');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finalModel = options.model || GENERATION_MODEL;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === 'start') {
            finalModel = parsed.modelUsed;
            callbacks.onStart?.(parsed.modelUsed, parsed.fallback);
          } else if (parsed.type === 'chunk') {
            callbacks.onChunk(parsed.text);
          } else if (parsed.type === 'fallback_notice') {
            callbacks.onFallbackNotice?.(parsed.message);
          } else if (parsed.type === 'done') {
            finalModel = parsed.modelUsed || finalModel;
          } else if (parsed.type === 'error') {
            callbacks.onError(parsed.error, parsed.code);
          }
        } catch {
          // ignore stream parse jitter
        }
      }
    }

    callbacks.onDone(finalModel);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onError(`Connection failed: ${msg}`, 'CONNECTION_ERROR');
  }
}

/**
 * Generate vector embeddings for texts in the browser
 */
export async function embedTexts(params: {
  model?: string;
  texts: string[];
  docName?: string;
  /** Optional per-text document titles (otherwise `docName` is used for all). */
  titles?: string[];
  query?: boolean;
}): Promise<EmbedResult> {
  countCall('embed');
  try {
    const res = await fetch('/api/gemini/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model || EMBEDDING_MODEL,
        texts: params.texts,
        docName: params.docName,
        titles: params.titles,
        query: params.query,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        embeddings: [],
        modelUsed: params.model || EMBEDDING_MODEL,
        dimension: 0,
        error: data.error || `HTTP ${res.status}`,
        code: data.code,
      };
    }

    return {
      success: true,
      embeddings: data.embeddings,
      modelUsed: data.modelUsed,
      dimension: data.dimension,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      embeddings: [],
      modelUsed: params.model || EMBEDDING_MODEL,
      dimension: 0,
      error: `Network failure: ${msg}`,
      code: 'NETWORK_ERROR',
    };
  }
}

/**
 * Rerank passages by clinical relevance (0-10) using Gemini
 */
export async function rerankPassages(
  query: string,
  passages: string[],
  model?: string
): Promise<number[]> {
  countCall('rerank');
  try {
    const res = await fetch('/api/gemini/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, passages, model }),
    });
    const data = await res.json();
    return data.scores || passages.map(() => 5);
  } catch (err) {
    console.warn('Rerank failed, defaulting to uniform scores:', err);
    return passages.map(() => 5);
  }
}

/**
 * Simulate 429 or 503 error for verification
 */
export async function simulateError(errorType: '429' | '503'): Promise<GenerateResult> {
  try {
    const res = await fetch('/api/gemini/simulate-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorType }),
    });
    const data = await res.json();
    return {
      success: false,
      text: '',
      modelUsed: 'simulated-test',
      error: data.error,
      code: data.code,
    };
  } catch (err: unknown) {
    return {
      success: false,
      text: '',
      modelUsed: 'simulated-test',
      error: String(err),
    };
  }
}

/**
 * Run a live connection test for both generation and embeddings
 */
export async function testConnection(
  generationModel = GENERATION_MODEL,
  embeddingModel = EMBEDDING_MODEL
): Promise<ConnectionTestResult> {
  const result: ConnectionTestResult = {
    generationPass: false,
    generationLatency: 0,
    generationModel,
    embeddingPass: false,
    embeddingLatency: 0,
    embeddingModel,
  };

  // Test 1: Tiny generation call
  const genStart = Date.now();
  try {
    const genRes = await generateContent({
      model: generationModel,
      contents: 'Respond with exactly one word: "OK"',
      temperature: 0.1,
    });
    result.generationLatency = Date.now() - genStart;
    if (genRes.success && genRes.text.length > 0) {
      result.generationPass = true;
      result.generationModel = genRes.modelUsed;
    } else {
      result.error = genRes.error || 'Generation failed';
    }
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  // Test 2: Tiny embedding call
  const embedStart = Date.now();
  try {
    const embedRes = await embedTexts({
      model: embeddingModel,
      texts: ['Medical verification ping.'],
      query: true,
    });
    result.embeddingLatency = Date.now() - embedStart;
    if (embedRes.success && embedRes.embeddings.length === 1 && embedRes.embeddings[0].length > 0) {
      result.embeddingPass = true;
      result.embeddingModel = embedRes.modelUsed;
    } else {
      result.error = (result.error ? result.error + '; ' : '') + (embedRes.error || 'Embedding failed');
    }
  } catch (err: unknown) {
    result.error = (result.error ? result.error + '; ' : '') + (err instanceof Error ? err.message : String(err));
  }

  return result;
}
