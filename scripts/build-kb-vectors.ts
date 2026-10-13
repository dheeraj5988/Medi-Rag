/**
 * Optional: precompute semantic vectors for the built-in MedlinePlus knowledge base ONCE,
 * so no visitor's browser ever needs to call the embedding API for it.
 *
 *   1. put GEMINI_API_KEY in .env
 *   2. npm run build-kb          (about 14 requests for 209 passages)
 *   3. commit/serve public/kb/kb_vectors.json
 *
 * The text format matches server.ts exactly ("title: ... | text: ..." for gemini-embedding-2).
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const key = process.env.GEMINI_API_KEY || '';
if (key.length < 6 || key === 'MY_GEMINI_API_KEY') {
  console.error('GEMINI_API_KEY is not set in .env. Nothing to do.');
  process.exit(1);
}

const model = process.env.EMBEDDING_MODEL || 'gemini-embedding-2';
const isModel2 = model.includes('embedding-2');
const BATCH = 16;
const ai = new GoogleGenAI({ apiKey: key });

interface Chunk { id: string; title: string; text: string }
const chunks: Chunk[] = JSON.parse(fs.readFileSync(path.join('public', 'kb', 'kb_chunks.json'), 'utf8'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(texts: string[]): Promise<number[][]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r: any = await ai.models.embedContent({
        model,
        contents: texts.map((t) => ({ parts: [{ text: t }] })), // one Content per text => one vector per text
        config: { outputDimensionality: 768, ...(isModel2 ? {} : { taskType: 'RETRIEVAL_DOCUMENT' }) },
      });
      const vectors: number[][] = (r.embeddings || []).map((e: any) => e.values || []);
      if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) {
        throw new Error(`got ${vectors.length} vectors for ${texts.length} texts`);
      }
      return vectors;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429')) {
        console.error('Quota/rate limit reached (429). Wait a minute, or use a key from another Google Cloud project, then run again.');
        process.exit(2);
      }
      if (attempt === 2) throw err;
      await sleep(1500 * (attempt + 1));
    }
  }
  return [];
}

async function main() {
  const out: Record<string, number[]> = {};
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const texts = slice.map((c) => (isModel2 ? `title: ${c.title} | text: ${c.text}` : c.text));
    const vectors = await embedBatch(texts);
    slice.forEach((c, j) => (out[c.id] = vectors[j].map((v) => Math.round(v * 1e4) / 1e4)));
    console.log(`embedded ${Math.min(chunks.length, i + BATCH)} / ${chunks.length}`);
    await sleep(300);
  }
  const dimension = Object.values(out)[0]?.length || 0;
  fs.writeFileSync(path.join('public', 'kb', 'kb_vectors.json'), JSON.stringify({ model, dimension, vectors: out }));
  console.log(`Wrote public/kb/kb_vectors.json (${Object.keys(out).length} vectors, ${dimension} dims, model ${model}).`);
  console.log('Restart the app and use Library > Restore built-in library so the vectors are loaded.');
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
