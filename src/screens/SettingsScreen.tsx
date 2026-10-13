import React, { useEffect, useState } from 'react';
import { Settings, Sliders, Database, Trash2, Download, Type, Layers } from 'lucide-react';
import { AVAILABLE_GENERATION_MODELS, AVAILABLE_EMBEDDING_MODELS } from '../constants';
import { getAllDocuments, getAllChunks, clearAllData } from '../lib/rag/db';
import { fetchAvailableModels, fetchHealth } from '../lib/gemini/client';

interface SettingsScreenProps {
  generationModel: string;
  onSetGenerationModel: (m: string) => void;
  embeddingModel: string;
  onSetEmbeddingModel: (m: string) => void;
  topK: number;
  onSetTopK: (k: number) => void;
  similarityThreshold: number;
  onSetSimilarityThreshold: (th: number) => void;
  rerankEnabled: boolean;
  onSetRerankEnabled: (enabled: boolean) => void;
  textSize: 'normal' | 'large';
  onSetTextSize: (size: 'normal' | 'large') => void;
}

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <section className="card p-4 sm:p-6 space-y-5">
    <h2 className="text-xl font-extrabold flex items-center gap-2">
      <span className="text-teal-600" aria-hidden="true">{icon}</span>
      <span>{title}</span>
    </h2>
    {children}
  </section>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  generationModel,
  onSetGenerationModel,
  embeddingModel,
  onSetEmbeddingModel,
  topK,
  onSetTopK,
  similarityThreshold,
  onSetSimilarityThreshold,
  rerankEnabled,
  onSetRerankEnabled,
  textSize,
  onSetTextSize,
}) => {
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [discovered, setDiscovered] = useState<Array<{ id: string; name: string }>>([]);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    (async () => {
      const health = await fetchHealth();
      setHasKey(health.hasApiKey);
      if (!health.hasApiKey) return;
      const { models } = await fetchAvailableModels();
      setDiscovered(
        models
          .filter((m) => m.name.startsWith('gemini') && m.name.includes('flash') && !/(embed|image|tts|live|audio|thinking|preview|exp)/.test(m.name))
          .map((m) => ({ id: m.name, name: m.displayName || m.name }))
      );
    })();
  }, []);

  const known = new Set(AVAILABLE_GENERATION_MODELS.map((m) => m.id));
  const extra = discovered.filter((m) => !known.has(m.id));

  const handleExportData = async () => {
    try {
      const docs = await getAllDocuments();
      const chunks = (await getAllChunks()).map((c) => ({ ...c, vector: [] as number[] })); // vectors omitted: they are large and re-creatable
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), documents: docs, chunks }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `medi_rag_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      setMessage({ kind: 'ok', text: `Exported ${docs.length} documents and ${chunks.length} passages (without vectors).` });
    } catch (err: unknown) {
      setMessage({ kind: 'bad', text: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleDeleteAllData = async () => {
    if (!window.confirm('Delete ALL documents, passages and chat history stored in this browser? Your uploads are lost. The built-in library is restored automatically.')) return;
    try {
      await clearAllData();
      localStorage.removeItem('medi_rag_chat_history');
      localStorage.removeItem('medi_rag_kb_version');
      setMessage({ kind: 'ok', text: 'Everything was deleted. The built-in MedlinePlus library will be restored the next time you open the Library or Check tab.' });
    } catch (err: unknown) {
      setMessage({ kind: 'bad', text: `Failed to clear data: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 md:py-8 space-y-5">
      <div>
        <span className="kicker">Make it yours</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-[1.05] mt-1 flex items-center gap-2">
          <Settings className="w-8 h-8 text-teal-600 shrink-0" aria-hidden="true" />
          <span>Settings</span>
        </h1>
      </div>

      {message && (
        <div role="status" className={`p-3 rounded-xl border-[1.5px] text-sm flex items-start justify-between gap-3 ${message.kind === 'ok' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200' : 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="btn btn-ghost btn-sm shrink-0">Dismiss</button>
        </div>
      )}

      <Section icon={<Layers className="w-6 h-6" />} title="Gemini models">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="set-gen">Writing model</label>
            <select id="set-gen" value={generationModel} onChange={(e) => onSetGenerationModel(e.target.value)} className="field">
              {AVAILABLE_GENERATION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
              {extra.length > 0 && (
                <optgroup label="Also available to your key">
                  {extra.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
              If this model is out of quota or busy, the server tries other Flash models automatically.
              {!hasKey && ' (No server key detected, so the list is the built-in one.)'}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="set-emb">Embedding model</label>
            <select id="set-emb" value={embeddingModel} onChange={(e) => onSetEmbeddingModel(e.target.value)} className="field">
              {AVAILABLE_EMBEDDING_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">Vectors from different embedding models cannot be mixed; the Library tab offers a re-index if you switch.</p>
          </div>
        </div>
      </Section>

      <Section icon={<Sliders className="w-6 h-6" />} title="Search">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label flex justify-between" htmlFor="set-topk">
              <span>Passages used per answer</span>
              <span className="font-mono">{topK}</span>
            </label>
            <input id="set-topk" type="range" min={1} max={10} value={topK} onChange={(e) => onSetTopK(Number(e.target.value))} className="w-full accent-teal-600" />
          </div>
          <div>
            <label className="label flex justify-between" htmlFor="set-th">
              <span>Minimum similarity (semantic search)</span>
              <span className="font-mono">{(similarityThreshold * 100).toFixed(0)}%</span>
            </label>
            <input id="set-th" type="range" min={0.1} max={0.8} step={0.05} value={similarityThreshold} onChange={(e) => onSetSimilarityThreshold(Number(e.target.value))} className="w-full accent-teal-600" />
          </div>
        </div>
        <label className="flex items-start gap-3 cursor-pointer min-h-11">
          <input type="checkbox" checked={rerankEnabled} onChange={(e) => onSetRerankEnabled(e.target.checked)} className="mt-1 accent-teal-600" />
          <span>
            <span className="font-extrabold text-sm block">Re-rank passages with Gemini</span>
            <span className="text-xs text-slate-600 dark:text-slate-300">Better ordering in Chat, but it costs one extra Gemini request per question, so it is off by default.</span>
          </span>
        </label>
      </Section>

      <Section icon={<Type className="w-6 h-6" />} title="Reading size">
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Text size">
          <button onClick={() => onSetTextSize('normal')} aria-pressed={textSize === 'normal'} className={`btn ${textSize === 'normal' ? 'btn-primary' : ''}`}>Standard</button>
          <button onClick={() => onSetTextSize('large')} aria-pressed={textSize === 'large'} className={`btn ${textSize === 'large' ? 'btn-primary' : ''}`}>Large</button>
        </div>
      </Section>

      <Section icon={<Database className="w-6 h-6" />} title="Your data">
        <p className="text-sm leading-relaxed">
          Documents, passages and chat history live only in this browser (IndexedDB and localStorage). Export a copy or wipe everything.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleExportData} className="btn"><Download className="w-4 h-4" /><span>Export data (JSON)</span></button>
          <button onClick={handleDeleteAllData} className="btn btn-danger"><Trash2 className="w-4 h-4" /><span>Delete all my data</span></button>
        </div>
      </Section>
    </div>
  );
};
