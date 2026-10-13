# Medi-RAG

Educational health-information app: a **symptom model** shortlists possible conditions, **trusted MedlinePlus text**
(retrieval) grounds them, and **Gemini** explains them in plain language with tappable citations.
It never gives a diagnosis. Mobile-first, works without an API key.

```
symptoms (chips or free text, any language)
   -> emergency red-flag check (plain code, runs first)
   -> Naive Bayes shortlist (41 diseases, runs in the browser, free)
   -> passages from the pages that cover each predicted condition (BM25, free)
   -> ONE Gemini call writes the explanation (optional)
   -> citations, sources, disclaimer
```

## Run it
```bash
bun install          # or: npm install
cp .env.example .env # optional: add GEMINI_API_KEY
bun run dev          # or: npm run dev     -> http://localhost:3000
```
For a production-style run: `bun run serve` (builds, then serves `dist/` with `NODE_ENV=production`).
The server also listens on your LAN, so you can open `http://<your-computer-ip>:3000` on a phone.

* **Without a key:** symptom shortlist, keyword retrieval over the built-in knowledge base, Chat shows the best-matching passages.
* **With a key:** free-text understanding, written explanations, streamed chat, Test Lab model tests.

## What is where
| Path | What |
|---|---|
| `server.ts` | Express: keeps the Gemini key, rate limit, validation, batched embeddings, runtime model fallback |
| `src/lib/ml/symptomModel.ts` | Naive Bayes shortlist (`public/model/symptom_model.json`) |
| `src/lib/ml/symptomExtract.ts` | free text -> symptom ids (aliases + one structured Gemini call) |
| `src/lib/rag/` | chunker, BM25, cosine, IndexedDB store, retrieval, built-in knowledge base loader |
| `public/kb/kb_chunks.json` | 209 passages from 40 MedlinePlus pages (U.S. National Library of Medicine, public domain) |
| `public/model/` | symptom model + its evaluation numbers |
| `scripts/build-kb-vectors.ts` | optional: precompute semantic vectors once (`npm run build-kb`) |

## Honest evaluation
The public dataset (41 diseases, 131 symptoms) is synthetic and repetitive (about 303 unique symptom patterns), so
high scores on complete symptom lists mean little. What matters is accuracy when only some symptoms are reported,
measured on held-out patterns (see the Test Lab and `public/model/symptom_model_eval.json`):

| symptoms reported | right disease first | in top 3 |
|---|---|---|
| 2 | 70.9% | 92.6% |
| 3 | 87.3% | 97.2% |
| 4 | 92.6% | 97.4% |
| 5 | 97.0% | 99.0% |

Real-world accuracy will be lower. Not clinically validated.

## Safety and privacy
Educational information, not medical advice. Uploaded documents and vectors stay in the browser (IndexedDB). The Gemini key stays on the
server. Text you ask about and the retrieved passages are sent to Google Gemini to write an answer. Photo analysis is experimental,
consent-gated and never used by the symptom model.

## Deploying publicly
Set `GEMINI_API_KEY` as a secret, serve over HTTPS, and keep the built-in rate limit (`RATE_LIMIT_PER_MINUTE`). Anyone with the link can use your Gemini quota.
