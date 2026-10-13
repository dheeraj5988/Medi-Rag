import React, { useState, useEffect } from 'react';
import { Navigation, ScreenId } from './components/Navigation';
import { EmergencyBanner } from './components/EmergencyBanner';
import { ChatScreen } from './screens/ChatScreen';
import { SymptomCheckerScreen } from './screens/SymptomCheckerScreen';
import { KnowledgeBaseScreen } from './screens/KnowledgeBaseScreen';
import { TestLabScreen } from './screens/TestLabScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AboutScreen } from './screens/AboutScreen';
import { ReadmeScreen } from './screens/ReadmeScreen';
import { RedFlagAlert } from './types';
import {
  GENERATION_MODEL,
  EMBEDDING_MODEL,
  DEFAULT_TOP_K,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_RERANK_ENABLED,
  FIXED_MEDICAL_DISCLAIMER,
} from './constants';
import { initializeSampleDocumentsIfEmpty } from './lib/rag/pipeline';
import { fetchAvailableModels } from './lib/gemini/client';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('chat');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('medi_rag_theme') === 'dark' ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    }
    return false;
  });

  // Hyperparameters & Settings
  const [generationModel, setGenerationModel] = useState<string>(GENERATION_MODEL);
  const [embeddingModel, setEmbeddingModel] = useState<string>(EMBEDDING_MODEL);
  const [topK, setTopK] = useState<number>(DEFAULT_TOP_K);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(DEFAULT_SIMILARITY_THRESHOLD);
  const [rerankEnabled, setRerankEnabled] = useState<boolean>(DEFAULT_RERANK_ENABLED);
  const [textSize, setTextSize] = useState<'normal' | 'large'>('normal');

  // Emergency Red Flag Alert state
  const [activeRedFlag, setActiveRedFlag] = useState<RedFlagAlert | null>(null);

  // Sync dark mode class on HTML document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('medi_rag_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('medi_rag_theme', 'light');
    }
  }, [darkMode]);

  // Initial startup: Preload sample clinical docs into IndexedDB and probe models
  useEffect(() => {
    const startup = async () => {
      try {
        await initializeSampleDocumentsIfEmpty(embeddingModel);
        const modelData = await fetchAvailableModels();
        if (modelData.models.length > 0) {
          console.log(`[Medi-RAG] Connected. Available models: ${modelData.models.length}`);
        }
      } catch (err) {
        console.warn('[Medi-RAG] Startup initialization error:', err);
      }
    };
    startup();
  }, [embeddingModel]);

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors ${
        textSize === 'large' ? 'text-base' : 'text-sm'
      }`}
    >
      {/* 1. High-Priority Emergency Banner (Shown at the very top before anything else) */}
      {activeRedFlag && (
        <EmergencyBanner alert={activeRedFlag} onDismiss={() => setActiveRedFlag(null)} />
      )}

      {/* 2. Top Bar Navigation */}
      <Navigation
        activeScreen={activeScreen}
        onNavigate={(screen) => setActiveScreen(screen)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        redFlagActive={Boolean(activeRedFlag?.triggered)}
      />

      {/* 3. Screen Body */}
      <main className="flex-1">
        {activeScreen === 'chat' && (
          <ChatScreen
            generationModel={generationModel}
            embeddingModel={embeddingModel}
            topK={topK}
            similarityThreshold={similarityThreshold}
            rerankEnabled={rerankEnabled}
            onTriggerRedFlag={(alert) => setActiveRedFlag(alert)}
            onNavigateToKnowledge={() => setActiveScreen('knowledge')}
          />
        )}

        {activeScreen === 'symptoms' && (
          <SymptomCheckerScreen
            generationModel={generationModel}
            embeddingModel={embeddingModel}
            topK={topK}
            similarityThreshold={similarityThreshold}
            rerankEnabled={rerankEnabled}
            onTriggerRedFlag={(alert) => setActiveRedFlag(alert)}
          />
        )}

        {activeScreen === 'knowledge' && (
          <KnowledgeBaseScreen
            embeddingModel={embeddingModel}
            onModelReindexNeeded={() => setActiveScreen('settings')}
          />
        )}

        {activeScreen === 'testlab' && (
          <TestLabScreen
            generationModel={generationModel}
            embeddingModel={embeddingModel}
          />
        )}

        {activeScreen === 'settings' && (
          <SettingsScreen
            generationModel={generationModel}
            onSetGenerationModel={setGenerationModel}
            embeddingModel={embeddingModel}
            onSetEmbeddingModel={setEmbeddingModel}
            topK={topK}
            onSetTopK={setTopK}
            similarityThreshold={similarityThreshold}
            onSetSimilarityThreshold={setSimilarityThreshold}
            rerankEnabled={rerankEnabled}
            onSetRerankEnabled={setRerankEnabled}
            textSize={textSize}
            onSetTextSize={setTextSize}
          />
        )}

        {activeScreen === 'about' && <AboutScreen />}

        {activeScreen === 'readme' && <ReadmeScreen />}
      </main>

      {/* 4. Quiet Clinical Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 py-3 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Medi-RAG Clinical Decision Support · Grounded Vector Retrieval with Gemini
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {FIXED_MEDICAL_DISCLAIMER}
          </span>
        </div>
      </footer>
    </div>
  );
}
