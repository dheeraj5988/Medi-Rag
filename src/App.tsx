import React, { useState, useEffect } from 'react';
import { MotionConfig } from 'motion/react';
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
import { fetchAvailableModels, fetchHealth } from './lib/gemini/client';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('symptoms');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('medi_rag_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Hyperparameters & Settings
  const [generationModel, setGenerationModel] = useState<string>(GENERATION_MODEL);
  const [embeddingModel, setEmbeddingModel] = useState<string>(EMBEDDING_MODEL);
  const [topK, setTopK] = useState<number>(DEFAULT_TOP_K);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(DEFAULT_SIMILARITY_THRESHOLD);
  const [rerankEnabled, setRerankEnabled] = useState<boolean>(DEFAULT_RERANK_ENABLED);
  const [textSize, setTextSize] = useState<'normal' | 'large'>(() =>
    localStorage.getItem('medi_rag_text_size') === 'large' ? 'large' : 'normal'
  );

  // Emergency Red Flag Alert state
  const [activeRedFlag, setActiveRedFlag] = useState<RedFlagAlert | null>(null);

  // Sync dark mode class on the HTML element (works because index.css declares a class-based dark variant)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('medi_rag_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('medi_rag_text_size', textSize);
  }, [textSize]);

  // Startup: seed the built-in MedlinePlus knowledge base (no API calls) and probe the models if a key exists
  useEffect(() => {
    const startup = async () => {
      try {
        await initializeSampleDocumentsIfEmpty(embeddingModel);
        const health = await fetchHealth();
        if (health.hasApiKey) {
          const modelData = await fetchAvailableModels();
          if (modelData.models.length > 0) {
            console.log(`[Medi-RAG] Connected. Available models: ${modelData.models.length}`);
          }
        } else {
          console.info('[Medi-RAG] No GEMINI_API_KEY on the server: ML prediction and retrieval work; Gemini features are off.');
        }
      } catch (err) {
        console.warn('[Medi-RAG] Startup initialization error:', err);
      }
    };
    startup();
  }, [embeddingModel]);

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`h-dvh flex flex-col font-sans bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors ${
        textSize === 'large' ? 'text-lg' : 'text-base'
      }`}
    >
      {/* 1. Emergency banner: always first, never scrolls away */}
      {activeRedFlag && <EmergencyBanner alert={activeRedFlag} onDismiss={() => setActiveRedFlag(null)} />}

      {/* 2. Top bar (desktop navigation) + bottom tab bar (phones) */}
      <Navigation
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        textSize={textSize}
        onToggleTextSize={() => setTextSize((s) => (s === 'large' ? 'normal' : 'large'))}
        redFlagActive={Boolean(activeRedFlag?.triggered)}
      />

      {/* 3. Screen body: the only scrolling region, padded so the tab bar never covers content */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[calc(var(--tabbar-h)+var(--safe-bottom))] md:pb-0">
        {activeScreen === 'chat' && (
          <ChatScreen
            generationModel={generationModel}
            embeddingModel={embeddingModel}
            topK={topK}
            similarityThreshold={similarityThreshold}
            rerankEnabled={rerankEnabled}
            onTriggerRedFlag={setActiveRedFlag}
            onNavigateToKnowledge={() => setActiveScreen('knowledge')}
          />
        )}

        {activeScreen === 'symptoms' && (
          <SymptomCheckerScreen
            generationModel={generationModel}
            embeddingModel={embeddingModel}
            onTriggerRedFlag={setActiveRedFlag}
          />
        )}

        {activeScreen === 'knowledge' && (
          <KnowledgeBaseScreen embeddingModel={embeddingModel} onModelReindexNeeded={() => setActiveScreen('settings')} />
        )}

        {activeScreen === 'testlab' && <TestLabScreen generationModel={generationModel} embeddingModel={embeddingModel} />}

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

      {/* 4. Disclaimer footer (desktop; on phones the disclaimer is on every result and in the More sheet) */}
      <footer className="hidden md:block shrink-0 border-t-[1.5px] border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 px-6 text-xs text-slate-600 dark:text-slate-300 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <span className="font-bold">Medi-RAG · ML shortlist + MedlinePlus retrieval + Gemini</span>
          <span className="font-mono text-[12px] text-right">{FIXED_MEDICAL_DISCLAIMER}</span>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}
