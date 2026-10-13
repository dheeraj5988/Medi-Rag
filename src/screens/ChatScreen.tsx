import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, RotateCcw, Trash2, ShieldCheck, BookOpen, ArrowUp, KeyRound } from 'lucide-react';
import { ChatMessage, RetrievalResult, RedFlagAlert } from '../types';
import { streamContent, fetchHealth } from '../lib/gemini/client';
import { retrievePassages } from '../lib/rag/pipeline';
import { detectRedFlags } from '../lib/rag/redFlags';
import { CitationModal } from '../components/CitationModal';
import { ImageCaptureControl, ImageAttachment } from '../components/ImageCaptureControl';
import { GROUNDED_SYSTEM_PROMPT, GENERAL_KNOWLEDGE_SYSTEM_PROMPT } from '../prompts';
import { FIXED_MEDICAL_DISCLAIMER, PRIVACY_ASSURANCE } from '../constants';

interface ChatScreenProps {
  generationModel: string;
  embeddingModel: string;
  topK: number;
  similarityThreshold: number;
  rerankEnabled: boolean;
  onTriggerRedFlag: (alert: RedFlagAlert) => void;
  onNavigateToKnowledge: () => void;
}

const HISTORY_KEY = 'medi_rag_chat_history';

const QUICK_QUESTIONS = [
  'What are the warning signs of dengue?',
  'How does malaria spread?',
  'What is the difference between type 1 and type 2 diabetes?',
  'How is tuberculosis treated?',
];

const WELCOME = `Hi! I'm **Medi-RAG**, an educational health-information assistant.

Ask me about a health condition and I'll answer **only from trusted sources** (the built-in MedlinePlus library and any documents you add), with numbered citations you can tap.

You can write in English, हिन्दी or another language.

${FIXED_MEDICAL_DISCLAIMER}`;

const CAPABILITIES = `Hello! I'm **Medi-RAG**, an educational health-information assistant.

**What I can do:**
- Explain conditions in plain language from MedlinePlus and your own documents, with tappable citations.
- Spot emergency warning signs and tell you when to seek urgent help.
- Reply in your language (English, हिन्दी and more).
- Look at a skin photo (experimental, not diagnostic).

For a symptom-by-symptom shortlist, use the **Check** tab.

*I never give a confirmed diagnosis or medicine doses.*

${FIXED_MEDICAL_DISCLAIMER}`;

/** Save history without embedding vectors or photos (the originals can exceed the localStorage quota). */
function persistHistory(messages: ChatMessage[]): void {
  try {
    const slim = messages.slice(-40).map((m) => ({
      ...m,
      image: undefined,
      sources: m.sources?.map((s) => ({ ...s, chunk: { ...s.chunk, vector: [] as number[] } })),
    }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
  } catch (err) {
    console.warn('Could not save chat history:', err);
  }
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  generationModel,
  embeddingModel,
  topK,
  similarityThreshold,
  rerankEnabled,
  onTriggerRedFlag,
  onNavigateToKnowledge,
}) => {
  const welcomeMessage = (): ChatMessage => ({
    id: 'welcome-msg',
    role: 'assistant',
    content: WELCOME,
    timestamp: Date.now(),
    isGeneralKnowledge: false,
    modelUsed: generationModel,
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore corrupt history
    }
    return [welcomeMessage()];
  });

  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<ImageAttachment | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [groundingMode, setGroundingMode] = useState(true);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<{ result: RetrievalResult; index: number } | null>(null);
  const [activeModelNotice, setActiveModelNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHealth().then((h) => setHasKey(h.hasApiKey));
  }, []);

  useEffect(() => {
    persistHistory(messages);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isStreaming]);

  const handleNewChat = () => {
    setMessages([{ ...welcomeMessage(), id: String(Date.now()), content: `New chat started.\n\n${WELCOME}` }]);
    setActiveModelNotice(null);
    setErrorNotice(null);
  };

  const handleClearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    handleNewChat();
  };

  const isGreetingOrCapabilityQuery = (text: string): boolean => {
    const clean = text.toLowerCase().trim().replace(/[!?.]+$/, '');
    const phrases = ['hi', 'hello', 'hey', 'greetings', 'namaste', 'नमस्ते', 'good morning', 'good evening', 'who are you', 'what can you do', 'what can you do for me', 'help'];
    return phrases.some((g) => clean === g || clean.startsWith(g + ' ') || clean.endsWith(' ' + g)) && clean.split(/\s+/).length <= 6;
  };

  const addAssistant = (content: string, extra: Partial<ChatMessage> = {}) =>
    setMessages((prev) => [
      ...prev,
      { id: `assistant-${Date.now()}`, role: 'assistant', content, timestamp: Date.now(), modelUsed: generationModel, ...extra },
    ]);

  const handleSendMessage = async (overridePrompt?: string) => {
    const currentAttachedImage = attachedImage;
    const queryText =
      (overridePrompt || input).trim() ||
      (currentAttachedImage
        ? 'Please describe the visible features of this skin photo (colour, lesion type, borders, pattern), what general educational considerations apply, sensible precautions and urgent warning signs.'
        : '');

    if (!queryText || isStreaming) return;

    setInput('');
    setAttachedImage(null);
    setErrorNotice(null);
    setActiveModelNotice(null);

    // 1. Red flags (deterministic)
    const redFlagAlert = detectRedFlags(queryText);
    if (redFlagAlert.triggered) onTriggerRedFlag(redFlagAlert);

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: queryText,
        timestamp: Date.now(),
        image: currentAttachedImage
          ? { base64: currentAttachedImage.base64, mimeType: currentAttachedImage.mimeType, fileName: currentAttachedImage.fileName }
          : undefined,
      },
    ]);
    setIsStreaming(true);

    // 2. Greetings / "what can you do" are answered locally (no API call)
    if (!currentAttachedImage && isGreetingOrCapabilityQuery(queryText)) {
      setTimeout(() => {
        addAssistant(CAPABILITIES);
        setIsStreaming(false);
      }, 250);
      return;
    }

    const health = await fetchHealth(true);
    setHasKey(health.hasApiKey);

    // 3. Retrieval (vector when vectors exist, otherwise keyword search; no key needed for keyword search)
    let retrievedContext: RetrievalResult[] = [];
    if (groundingMode || !health.hasApiKey) {
      try {
        retrievedContext = await retrievePassages(
          currentAttachedImage ? `${queryText} skin condition rash precautions` : queryText,
          {
            embeddingModel,
            topK,
            similarityThreshold: currentAttachedImage ? 0.2 : similarityThreshold,
            rerank: rerankEnabled && health.hasApiKey,
          }
        );
      } catch (err) {
        console.warn('Passage retrieval failed:', err);
      }
    }

    // 3b. No Gemini key: still useful. Show the retrieved passages instead of a written answer.
    if (!health.hasApiKey) {
      if (retrievedContext.length === 0) {
        addAssistant(`I searched the knowledge base but found no relevant passages for "${queryText}".\n\nNo Gemini key is configured, so I cannot write an answer from general knowledge either. Try different words, or add GEMINI_API_KEY to the .env file.\n\n${FIXED_MEDICAL_DISCLAIMER}`, { sources: [] });
      } else {
        addAssistant(
          `**Offline mode (no Gemini key):** here are the most relevant passages from trusted sources. Tap a number to read it.\n\n` +
            retrievedContext.map((r, i) => `[${i + 1}] **${r.chunk.docName}**: ${r.chunk.text.length > 420 ? r.chunk.text.slice(0, 420) + '...' : r.chunk.text}`).join('\n\n') +
            `\n\n${FIXED_MEDICAL_DISCLAIMER}`,
          { sources: retrievedContext }
        );
      }
      setIsStreaming(false);
      return;
    }

    // 3c. Grounded mode and nothing relevant found: refuse rather than guess
    if (groundingMode && retrievedContext.length === 0) {
      addAssistant(
        `I searched my trusted sources but **did not find passages relevant enough** to answer "${queryText}".\n\nRather than guess, I'd suggest:\n- Adding an authoritative document on this topic in the **Library** tab.\n- Or switching **General AI** on above if you want a clearly-labelled general answer.\n- And asking a doctor for personal advice.\n\n${FIXED_MEDICAL_DISCLAIMER}`,
        { sources: [], isGeneralKnowledge: false }
      );
      setIsStreaming(false);
      return;
    }

    // 4. Prompt with context + last 6 turns
    const historyString = messages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    const imageNotice = currentAttachedImage ? '\n[The patient attached a skin photo. Describe visible features only; this is experimental and not diagnostic.]' : '';

    const promptContent =
      groundingMode && retrievedContext.length > 0
        ? `Conversation History:\n${historyString}\n\nTRUSTED CONTEXT PASSAGES:\n${retrievedContext
            .map((r, idx) => `[Passage ${idx + 1}] (Document: ${r.chunk.docName}, Source: ${r.chunk.trustedSource}, Page: ${r.chunk.page}):\n${r.chunk.text}`)
            .join('\n\n')}\n\nPatient question:${imageNotice}\n${queryText}\n\nAnswer from the passages above and cite with [1], [2], etc.`
        : `Conversation History:\n${historyString}\n\nPatient question:${imageNotice}\n${queryText}\n\nGive general educational information.`;

    // 5. Stream
    const assistantMessageId = `assistant-${Date.now()}`;
    let accumulatedText = '';
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '', timestamp: Date.now(), sources: retrievedContext, isGeneralKnowledge: !groundingMode, modelUsed: generationModel },
    ]);

    await streamContent(
      {
        model: generationModel,
        contents: promptContent,
        systemInstruction: groundingMode ? GROUNDED_SYSTEM_PROMPT : GENERAL_KNOWLEDGE_SYSTEM_PROMPT,
        temperature: 0.2,
        image: currentAttachedImage ? { base64: currentAttachedImage.base64, mimeType: currentAttachedImage.mimeType } : undefined,
      },
      {
        onStart: (modelUsed, fallback) => {
          if (fallback) setActiveModelNotice(`The primary model was busy. Answering with ${modelUsed}.`);
        },
        onChunk: (chunk) => {
          accumulatedText += chunk;
          setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, content: accumulatedText } : m)));
        },
        onDone: (finalModel) => {
          setIsStreaming(false);
          setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? { ...m, modelUsed: finalModel } : m)));
        },
        onError: (errMsg) => {
          setIsStreaming(false);
          setErrorNotice(errMsg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: accumulatedText
                      ? `${accumulatedText}\n\n⚠️ The answer was cut short: ${errMsg}`
                      : `⚠️ **I could not finish this answer:** ${errMsg}\n\nYou can retry, pick another model in Settings, or read the retrieved passages below.\n\n${FIXED_MEDICAL_DISCLAIMER}`,
                    isError: true,
                  }
                : m
            )
          );
        },
        onFallbackNotice: (msg) => setActiveModelNotice(msg),
      }
    );
  };

  /** Bold markers and tappable [n] citation badges */
  const renderInline = (text: string, sources?: RetrievalResult[]) =>
    text.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((part, index) => {
      const cite = part.match(/^\[(\d+)\]$/);
      if (cite && sources) {
        const n = parseInt(cite[1], 10);
        const src = sources[n - 1];
        if (src) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => setSelectedCitation({ result: src, index: n })}
              className="tap-auto inline-flex items-center justify-center min-h-0 h-6 min-w-6 px-1.5 mx-0.5 text-xs font-extrabold rounded-md bg-lime-400 text-slate-900 border border-slate-900 align-baseline"
              aria-label={`Open source ${n}: ${src.chunk.docName}`}
            >
              {n}
            </button>
          );
        }
      }
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) return <strong key={index}>{bold[1]}</strong>;
      return <span key={index}>{part}</span>;
    });

  const renderMessageContent = (content: string, sources?: RetrievalResult[]) => {
    if (!content) {
      return (
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300 py-1" role="status">
          <span className="dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="text-sm">Reading the sources...</span>
        </div>
      );
    }
    return (
      <div className="text-base md:text-sm leading-relaxed whitespace-pre-wrap break-words">{renderInline(content, sources)}</div>
    );
  };

  return (
    <div className="h-full max-w-3xl mx-auto px-3 sm:px-6 flex flex-col">
      {/* Mode strip */}
      <div className="shrink-0 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 min-w-0">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline truncate">{PRIVACY_ASSURANCE}</span>
            <span className="sm:hidden">Your documents stay in this browser</span>
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleNewChat} className="btn btn-ghost btn-sm" aria-label="Start a new chat"><RotateCcw className="w-4 h-4" /><span className="hidden md:inline">New</span></button>
            <button onClick={handleClearHistory} className="btn btn-ghost btn-sm" aria-label="Clear chat history"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl border-[1.5px] border-slate-900 dark:border-slate-600 bg-white dark:bg-slate-900" role="group" aria-label="Answer mode">
          <button type="button" onClick={() => setGroundingMode(true)} aria-pressed={groundingMode} className={`min-h-11 rounded-xl text-sm font-bold ${groundingMode ? 'bg-lime-400 text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
            From my sources
          </button>
          <button type="button" onClick={() => setGroundingMode(false)} aria-pressed={!groundingMode} className={`min-h-11 rounded-xl text-sm font-bold ${!groundingMode ? 'bg-amber-300 text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
            General AI
          </button>
        </div>

        {hasKey === false && (
          <p className="flex items-start gap-2 text-xs p-2.5 rounded-xl border-[1.5px] border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
            <KeyRound className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span><b>Offline mode:</b> no Gemini key on the server, so I show the best-matching passages instead of writing an answer.</span>
          </p>
        )}
        {activeModelNotice && (
          <div className="p-2.5 text-sm rounded-xl border-[1.5px] border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
            <span>{activeModelNotice}</span>
            <button onClick={() => setActiveModelNotice(null)} className="btn btn-ghost btn-sm shrink-0">OK</button>
          </div>
        )}
        {errorNotice && (
          <div role="alert" className="p-2.5 text-sm rounded-xl border-[1.5px] border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
            <span>{errorNotice}</span>
            <button onClick={() => setErrorNotice(null)} className="btn btn-ghost btn-sm shrink-0">Dismiss</button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2 space-y-4" aria-live="polite">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex flex-col max-w-[92%] ${isUser ? 'ml-auto items-end' : 'mr-auto items-start'}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-700 dark:text-slate-200">{isUser ? 'You' : 'Medi-RAG'}</span>
                <span className="font-mono">{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {!isUser && message.modelUsed && message.content && <span className="font-mono truncate max-w-[10rem]">{message.modelUsed}</span>}
                {!isUser && message.isGeneralKnowledge && <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-300 text-slate-900 border border-slate-900">Not source-backed</span>}
              </div>

              <div className={`p-3.5 sm:p-4 rounded-2xl border-[1.5px] ${isUser ? 'bg-lime-400 text-slate-900 border-slate-900 rounded-tr-md' : 'bg-white dark:bg-slate-900 border-slate-900 dark:border-slate-600 rounded-tl-md shadow-xs'}`}>
                {isUser && message.image && (
                  <div className="mb-2.5 rounded-xl overflow-hidden border border-slate-900 max-w-xs">
                    <img src={`data:${message.image.mimeType};base64,${message.image.base64}`} alt="Attached skin photo" className="w-full h-auto max-h-60 object-cover" />
                  </div>
                )}
                {isUser ? <p className="text-base md:text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p> : renderMessageContent(message.content, message.sources)}

                {!isUser && message.sources && message.sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-extrabold mb-2 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-teal-600" aria-hidden="true" />Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.map((src, idx) => (
                        <button key={src.chunk.id} type="button" onClick={() => setSelectedCitation({ result: src, index: idx + 1 })} className="chip text-left">
                          <span className="font-extrabold">[{idx + 1}]</span>
                          <span className="truncate max-w-[9rem]">{src.chunk.docName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick questions */}
      {messages.length <= 2 && (
        <div className="shrink-0 py-2">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Try asking</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
            {QUICK_QUESTIONS.map((q) => (
              <button key={q} onClick={() => handleSendMessage(q)} disabled={isStreaming} className="chip shrink-0 whitespace-nowrap">
                {q}
              </button>
            ))}
            <button onClick={onNavigateToKnowledge} className="chip shrink-0 whitespace-nowrap border-dashed">Add my own documents</button>
          </div>
        </div>
      )}

      {/* Composer: always visible above the tab bar */}
      <div className="shrink-0 pt-2 pb-3 space-y-2 bg-slate-50 dark:bg-slate-950">
        {attachedImage && <ImageCaptureControl image={attachedImage} onImageChange={setAttachedImage} />}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-1.5"
        >
          {!attachedImage && <ImageCaptureControl image={attachedImage} onImageChange={setAttachedImage} compact />}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
            enterKeyHint="send"
            aria-label="Your question"
            placeholder={attachedImage ? 'Ask about this photo...' : groundingMode ? 'Ask a health question...' : 'Ask using general AI knowledge...'}
            className="field flex-1 min-w-0"
          />
          <button type="submit" disabled={isStreaming || (!input.trim() && !attachedImage)} className="btn btn-primary shrink-0 !px-3.5" aria-label="Send">
            <span className="hidden sm:inline">{attachedImage && !input.trim() ? 'Analyse' : 'Ask'}</span>
            <ArrowUp className="w-5 h-5 sm:hidden" />
            <Send className="w-4 h-4 hidden sm:block" />
          </button>
        </form>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">Decision support only. Never a confirmed diagnosis.</p>
      </div>

      <CitationModal isOpen={Boolean(selectedCitation)} onClose={() => setSelectedCitation(null)} citation={selectedCitation?.result || null} citationIndex={selectedCitation?.index} />
    </div>
  );
};
