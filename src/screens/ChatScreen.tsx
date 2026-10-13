import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  RotateCcw,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Info,
  ChevronRight,
  BookOpen,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { ChatMessage, RetrievalResult, RedFlagAlert } from '../types';
import { streamContent, generateContent } from '../lib/gemini/client';
import { retrievePassages } from '../lib/rag/pipeline';
import { detectRedFlags } from '../lib/rag/redFlags';
import { CitationModal } from '../components/CitationModal';
import { ImageCaptureControl, ImageAttachment } from '../components/ImageCaptureControl';
import {
  GROUNDED_SYSTEM_PROMPT,
  GENERAL_KNOWLEDGE_SYSTEM_PROMPT,
} from '../prompts';
import {
  GENERATION_MODEL,
  EMBEDDING_MODEL,
  FIXED_MEDICAL_DISCLAIMER,
  PRIVACY_ASSURANCE,
} from '../constants';

interface ChatScreenProps {
  generationModel: string;
  embeddingModel: string;
  topK: number;
  similarityThreshold: number;
  rerankEnabled: boolean;
  onTriggerRedFlag: (alert: RedFlagAlert) => void;
  onNavigateToKnowledge: () => void;
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('medi_rag_chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      {
        id: 'welcome-msg',
        role: 'assistant',
        content: `Hello! I am Medi-RAG, your educational clinical decision-support assistant.

I can help explain symptoms, synthesize clinical guidance from your trusted uploaded documents (e.g., WHO, CDC, MedlinePlus), and analyze **skin condition or rash photos** taken directly from your camera or uploaded from your computer.

**How can I assist your health inquiry today?** You may describe symptoms, attach a skin photo, or search clinical topics (in English, हिन्दी, or other languages).

${FIXED_MEDICAL_DISCLAIMER}`,
        timestamp: Date.now(),
        isGeneralKnowledge: false,
        modelUsed: generationModel,
      },
    ];
  });

  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<ImageAttachment | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [groundingMode, setGroundingMode] = useState(true);
  const [selectedCitation, setSelectedCitation] = useState<{
    result: RetrievalResult;
    index: number;
  } | null>(null);
  const [activeModelNotice, setActiveModelNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Save conversation memory
  useEffect(() => {
    localStorage.setItem('medi_rag_chat_history', JSON.stringify(messages));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Handle new chat / clear history
  const handleNewChat = () => {
    setMessages([
      {
        id: String(Date.now()),
        role: 'assistant',
        content: `New consultation started. Ask a question regarding medical symptoms or guidance from your uploaded documents.\n\n${FIXED_MEDICAL_DISCLAIMER}`,
        timestamp: Date.now(),
        isGeneralKnowledge: false,
        modelUsed: generationModel,
      },
    ]);
    setActiveModelNotice(null);
    setErrorNotice(null);
  };

  const handleClearHistory = () => {
    localStorage.removeItem('medi_rag_chat_history');
    handleNewChat();
  };

  // Check if user input is a friendly greeting or capability inquiry
  const isGreetingOrCapabilityQuery = (text: string): boolean => {
    const clean = text.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'greetings', 'namaste', 'नमस्ते', 'good morning', 'good evening', 'who are you', 'what can you do', 'help'];
    return greetings.some((g) => clean === g || clean.startsWith(g + ' ') || clean.endsWith(' ' + g));
  };

  // Submit User Message
  const handleSendMessage = async (overridePrompt?: string) => {
    const currentAttachedImage = attachedImage;
    const queryText =
      (overridePrompt || input).trim() ||
      (currentAttachedImage
        ? 'Please visually analyze this attached dermatological skin photo: describe morphological characteristics (erythema, lesion type, borders, pattern), discuss potential educational considerations based on medical guidelines, necessary precautions, and urgent warning signs.'
        : '');

    if (!queryText || isStreaming) return;

    setInput('');
    setAttachedImage(null);
    setErrorNotice(null);
    setActiveModelNotice(null);

    // 1. Red Flag Detection
    const redFlagAlert = detectRedFlags(queryText);
    if (redFlagAlert.triggered) {
      onTriggerRedFlag(redFlagAlert);
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: Date.now(),
      image: currentAttachedImage
        ? {
            base64: currentAttachedImage.base64,
            mimeType: currentAttachedImage.mimeType,
            fileName: currentAttachedImage.fileName,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    // 2. Greeting or capability check (skip if image attached)
    if (!currentAttachedImage && isGreetingOrCapabilityQuery(queryText)) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `Hello! I am **Medi-RAG**, your educational clinical decision-support assistant.

**What I can do:**
- **Analyze skin photos (Dermatology):** Upload a picture from your PC or take a photo with your camera to evaluate rashes, lesions, and skin concerns.
- **Retrieve clinical facts** from your uploaded medical documents (IndexedDB) with verifiable citations.
- **Explain symptoms and conditions** in plain language, detailing common symptoms, general precautions, and next steps.
- **Detect critical red flags** (e.g. acute chest pain, respiratory distress, stroke signs, spreading skin infections) and immediately provide emergency escalation guidance.
- **Multilingual support:** Write in English, Hindi (हिंदी), or your preferred language.

*Note: I provide educational decision support and never give a confirmed diagnosis or medication prescriptions.*\n\n${FIXED_MEDICAL_DISCLAIMER}`,
            timestamp: Date.now(),
            modelUsed: generationModel,
          },
        ]);
        setIsStreaming(false);
      }, 300);
      return;
    }

    // 3. Retrieval Step (if Grounding is ON)
    const retrievalQuery = currentAttachedImage
      ? `${queryText} dermatological skin condition rash erythema precautions eczema psoriasis tinea contact dermatitis`
      : queryText;

    let retrievedContext: RetrievalResult[] = [];
    if (groundingMode) {
      try {
        retrievedContext = await retrievePassages(retrievalQuery, {
          embeddingModel,
          topK,
          similarityThreshold: currentAttachedImage ? 0.2 : similarityThreshold,
          rerank: rerankEnabled,
          rerankModel: 'gemini-3.1-flash-lite',
        });
      } catch (err) {
        console.warn('Passage retrieval failed:', err);
      }
    }

    // If grounding mode is ON and zero passages were found above threshold
    if (groundingMode && retrievedContext.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `I searched your uploaded medical knowledge base, but **did not find sufficiently relevant verified passages** to answer: "${queryText}".

To ensure clinical safety, I refuse to fabricate medical guidance without trusted source evidence.

**Recommendations:**
- If you have authoritative clinical guidelines on this topic (e.g. from WHO, CDC, AAD), please upload them in the **Knowledge Base** tab.
- Or, switch the **"Grounded in my documents"** toggle OFF above the input bar if you wish to see general AI knowledge.
- Please consult a licensed medical professional or dermatologist for personal clinical advice.

${FIXED_MEDICAL_DISCLAIMER}`,
          timestamp: Date.now(),
          sources: [],
          isGeneralKnowledge: false,
          modelUsed: generationModel,
        },
      ]);
      setIsStreaming(false);
      return;
    }

    // 4. Construct Prompt with Context & Conversation Memory (last 6 turns)
    const recentMessages = messages.slice(-6);
    const historyString = recentMessages
      .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    let promptContent = '';
    const imageNotice = currentAttachedImage
      ? '\n[Visual Dermatological Photo Attached by Patient. Please analyze the morphological visual features visible in the image].'
      : '';

    if (groundingMode && retrievedContext.length > 0) {
      const contextBlocks = retrievedContext
        .map(
          (r, idx) =>
            `[Passage ${idx + 1}] (Document: ${r.chunk.docName}, Source: ${r.chunk.trustedSource}, Page: ${r.chunk.page}, Similarity: ${(r.score * 100).toFixed(1)}%):\n${r.chunk.text}`
        )
        .join('\n\n');

      promptContent = `Conversation History:
${historyString}

TRUSTED CONTEXT PASSAGES:
${contextBlocks}

Patient Question & Medical Request:${imageNotice}
${queryText}

Please synthesize an educational answer based on the visual image and the passages above. Cite specific claims with [1], [2], etc.`;
    } else {
      promptContent = `Conversation History:
${historyString}

Patient Question & Medical Request:${imageNotice}
${queryText}

Please provide general educational medical information answering this inquiry and analyzing the attached image.`;
    }

    // 5. Stream the response from Gemini
    const assistantMessageId = `assistant-${Date.now()}`;
    let accumulatedText = '';

    // Create placeholder message
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        sources: retrievedContext,
        isGeneralKnowledge: !groundingMode,
        modelUsed: generationModel,
      },
    ]);

    await streamContent(
      {
        model: generationModel,
        contents: promptContent,
        systemInstruction: groundingMode ? GROUNDED_SYSTEM_PROMPT : GENERAL_KNOWLEDGE_SYSTEM_PROMPT,
        temperature: 0.2,
        image: currentAttachedImage
          ? {
              base64: currentAttachedImage.base64,
              mimeType: currentAttachedImage.mimeType,
            }
          : undefined,
      },
      {
        onStart: (modelUsed, fallback) => {
          if (fallback) {
            setActiveModelNotice(`Note: Primary model was busy. Falling back to ${modelUsed}.`);
          }
        },
        onChunk: (chunk) => {
          accumulatedText += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, content: accumulatedText } : m))
          );
        },
        onDone: (finalModel) => {
          setIsStreaming(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    modelUsed: finalModel,
                  }
                : m
            )
          );
        },
        onError: (errMsg, code) => {
          setIsStreaming(false);
          setErrorNotice(errMsg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: `⚠️ **Unable to complete response:** ${errMsg}\n\nPlease try again or switch to another model in Settings.\n\n${FIXED_MEDICAL_DISCLAIMER}`,
                    isError: true,
                  }
                : m
            )
          );
        },
        onFallbackNotice: (msg) => {
          setActiveModelNotice(msg);
        },
      }
    );
  };

  // Render text with clickable citation badges [1], [2]
  const renderMessageContent = (content: string, sources?: RetrievalResult[]) => {
    if (!content) {
      return (
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 py-1">
          <span className="inline-block w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <span>Synthesizing clinical response from passages...</span>
        </div>
      );
    }

    // Split text by citation pattern [1], [2], etc.
    const parts = content.split(/(\[\d+\])/g);

    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {parts.map((part, index) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match && sources && sources.length > 0) {
            const citationNum = parseInt(match[1], 10);
            const sourceIndex = citationNum - 1;
            const sourceResult = sources[sourceIndex];

            if (sourceResult) {
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedCitation({ result: sourceResult, index: citationNum })}
                  className="inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 text-xs font-semibold rounded bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-800 transition-colors cursor-pointer border border-teal-300/60 dark:border-teal-700 align-baseline"
                  title={`Click to view passage: ${sourceResult.chunk.docName} (Similarity: ${(sourceResult.score * 100).toFixed(0)}%)`}
                >
                  [{citationNum}]
                </button>
              );
            }
          }
          return <span key={index}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] max-w-5xl mx-auto px-4 sm:px-6 py-4">
      {/* Privacy & Mode Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="hidden sm:inline">{PRIVACY_ASSURANCE}</span>
          <span className="sm:hidden">Local IndexedDB Mode: Embeddings stay in browser</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Grounding mode toggle */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setGroundingMode(true)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                groundingMode
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Grounded in My Documents
            </button>
            <button
              onClick={() => setGroundingMode(false)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                !groundingMode
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              General AI Knowledge
            </button>
          </div>

          <button
            onClick={handleNewChat}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 rounded transition-colors"
            title="Start fresh consultation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">New Chat</span>
          </button>
          <button
            onClick={handleClearHistory}
            className="flex items-center gap-1 text-slate-400 hover:text-rose-600 px-2 py-1 rounded transition-colors"
            title="Clear all chat history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Model Notice / Fallback Banner */}
      {activeModelNotice && (
        <div className="my-2 p-2.5 text-xs rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <span>{activeModelNotice}</span>
          <button onClick={() => setActiveModelNotice(null)} className="text-amber-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="my-2 p-3 text-xs rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 flex items-center justify-between">
          <span>{errorNotice}</span>
          <button onClick={() => setErrorNotice(null)} className="text-rose-600 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Chat Messages List */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-3xl ${
                isUser ? 'ml-auto' : 'mr-auto'
              }`}
            >
              {/* Message Header Tag */}
              <div className="flex items-center gap-2 mb-1 text-xs text-slate-400 dark:text-slate-500">
                <span className="font-semibold text-slate-600 dark:text-slate-400">
                  {isUser ? 'You' : 'Medi-RAG Assistant'}
                </span>
                <span>·</span>
                <span className="font-mono">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {!isUser && message.modelUsed && (
                  <>
                    <span>·</span>
                    <span className="font-mono text-teal-600 dark:text-teal-400 text-[11px]">
                      {message.modelUsed}
                    </span>
                  </>
                )}
                {!isUser && message.isGeneralKnowledge && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Not source-backed
                  </span>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`p-4 rounded-xl border ${
                  isUser
                    ? 'bg-teal-600 text-white border-teal-700 rounded-tr-xs'
                    : 'bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700/80 rounded-tl-xs shadow-xs'
                }`}
              >
                {isUser && message.image && (
                  <div className="mb-2.5 rounded-lg overflow-hidden border border-teal-500/50 max-w-xs shadow-xs bg-black/10">
                    <img
                      src={`data:${message.image.mimeType};base64,${message.image.base64}`}
                      alt="Patient skin condition photo"
                      className="w-full h-auto max-h-60 object-cover"
                    />
                    <div className="text-[10px] text-teal-100 bg-teal-800/80 px-2.5 py-1 flex items-center justify-between">
                      <span className="truncate">📷 {message.image.fileName || 'Skin Photo'}</span>
                      <span className="font-semibold text-teal-200">Analyzed</span>
                    </div>
                  </div>
                )}

                {isUser ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                ) : (
                  renderMessageContent(message.content, message.sources)
                )}

                {/* Sources List for Assistant messages */}
                {!isUser && message.sources && message.sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                      <span>Retrieved Clinical Passages ({message.sources.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.map((src, idx) => (
                        <button
                          key={src.chunk.id}
                          type="button"
                          onClick={() => setSelectedCitation({ result: src, index: idx + 1 })}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-slate-50 dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-teal-300 transition-colors cursor-pointer text-left"
                        >
                          <span className="font-bold text-teal-700 dark:text-teal-400">[{idx + 1}]</span>
                          <span className="truncate max-w-[150px]">{src.chunk.docName}</span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            {(src.score * 100).toFixed(0)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Inquiries */}
      {messages.length <= 2 && (
        <div className="py-2 flex items-center gap-2 overflow-x-auto text-xs text-slate-600 dark:text-slate-400">
          <span className="text-slate-400 shrink-0">Try asking:</span>
          <button
            onClick={() => handleSendMessage('What are the critical warning signs of dengue?')}
            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-teal-50 dark:bg-slate-800 dark:hover:bg-slate-700 hover:text-teal-700 transition-colors whitespace-nowrap"
          >
            "What are the critical warning signs of dengue?"
          </button>
          <button
            onClick={() => handleSendMessage('How can I tell the difference between eczema and psoriasis?')}
            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-teal-50 dark:bg-slate-800 dark:hover:bg-slate-700 hover:text-teal-700 transition-colors whitespace-nowrap"
          >
            "Eczema vs Psoriasis differences?"
          </button>
          <button
            onClick={() => handleSendMessage('How can I tell the difference between common cold and influenza?')}
            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-teal-50 dark:bg-slate-800 dark:hover:bg-slate-700 hover:text-teal-700 transition-colors whitespace-nowrap"
          >
            "Cold vs Influenza differences?"
          </button>
        </div>
      )}

      {/* Input Form with Camera & Upload Controls */}
      <div className="pt-2 space-y-2">
        {/* If image is attached, show preview card */}
        {attachedImage && (
          <ImageCaptureControl
            image={attachedImage}
            onImageChange={setAttachedImage}
          />
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Compact Camera / Upload Controls */}
          {!attachedImage && (
            <div className="shrink-0 flex items-center">
              <ImageCaptureControl
                image={attachedImage}
                onImageChange={setAttachedImage}
                compact={true}
              />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex-1 flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isStreaming}
              placeholder={
                attachedImage
                  ? 'Ask about this skin photo (or press Send for automatic clinical analysis)...'
                  : groundingMode
                  ? 'Ask a medical or skin question (answering strictly from your trusted documents)...'
                  : 'Ask a question using general AI medical knowledge...'
              }
              className="w-full pl-4 pr-24 py-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 shadow-xs"
            />
            <div className="absolute right-2 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={isStreaming || (!input.trim() && !attachedImage)}
                className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <span>{attachedImage && !input.trim() ? 'Analyze' : 'Ask'}</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-1">
          <span>Decisions support only · Never gives a confirmed diagnosis</span>
          <span>Upload PC picture or snap photo with camera</span>
        </div>
      </div>

      {/* Citation Details Modal */}
      <CitationModal
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        citation={selectedCitation?.result || null}
        citationIndex={selectedCitation?.index}
      />
    </div>
  );
};
