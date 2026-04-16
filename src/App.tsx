import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  User, 
  Search, 
  MessageSquare, 
  X, 
  ArrowRight,
  HelpCircle,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Moon,
  Sun,
  LayoutDashboard,
  Menu,
  Zap,
  History,
  Info,
  Briefcase,
  Package,
  ShieldCheck,
  CreditCard,
  Cpu,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Download,
  MoreVertical,
  Mic,
  MicOff
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import { askFaq } from './services/api';

const genAI = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
const model = "gemini-2.5-flash";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

interface Message {
  id: string;
  chatId: string;
  type: 'bot' | 'user';
  text: string;
  faq?: FAQ;
  suggestions?: FAQ[];
  isFallback?: boolean;
  timestamp: Date;
  feedback?: 'helpful' | 'unhelpful';
  score?: number;
  matchedQuestion?: string;
}

const STORAGE_KEY = 'techcorp_chat_history_v2';
const THEME_KEY = 'techcorp_theme';

const TechCorpLogo = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 100 100" 
    className={cn("w-10 h-10", className)}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="100" rx="24" fill="url(#logo-gradient)" />
    <path 
      d="M30 40C30 34.4772 34.4772 30 40 30H60C65.5228 30 70 34.4772 70 40V55C70 60.5228 65.5228 65 60 65H45L35 75V65H40C34.4772 65 30 60.5228 30 55V40Z" 
      fill="white" 
      fillOpacity="0.2" 
    />
    <path 
      d="M35 45C35 41.6863 37.6863 39 41 39H59C62.3137 39 65 41.6863 65 45V55C65 58.3137 62.3137 61 59 61H48L40 68V61H41C37.6863 61 35 58.3137 35 55V45Z" 
      fill="white" 
    />
    <path 
      d="M50 44L52.4495 48.9623L57.9263 49.7611L53.9632 53.624L54.899 59.0754L50 56.5L45.101 59.0754L46.0368 53.624L42.0737 49.7611L47.5505 48.9623L50 44Z" 
      fill="#4F46E5" 
    />
    <path 
      d="M75 30L80 35M80 30L75 35" 
      stroke="white" 
      strokeWidth="2" 
      strokeLinecap="round" 
      opacity="0.6"
    />
    <defs>
      <linearGradient id="logo-gradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366F1" />
        <stop offset="1" stopColor="#4F46E5" />
      </linearGradient>
    </defs>
  </svg>
);

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string>(Date.now().toString());
  const [chatSession, setChatSession] = useState<any>(null);
  const [highlightedMessage, setHighlightedMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'initializing' | 'listening' | 'processing'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const createNewSession = () => {
    const session = genAI.chats.create({
      model,
      config: {
        systemInstruction: `You are the TechCorp Semantic Assistant, a super friendly, casual, and empathetic AI chatbot. 
        Your goal is to help users feel heard and supported while providing accurate info from our FAQ database.
        
        TONE & STYLE:
        - Be extremely casual and warm (use "Hey!", "Sure thing!", "I'd love to help with that!", "No worries at all!", "I'm here for you!").
        - Show deep empathy, especially if the user seems confused or if you're not 100% sure of the answer.
        - Use natural, human-like sentences. Avoid sounding like a database search result.
        - If you don't know something, be honest but super supportive.
        
        GUIDELINES:
        1. If the FAQ match is very high (score > 0.9), use the FAQ answer but wrap it in a warm, conversational shell.
        2. If the match is medium (0.6 - 0.9), acknowledge their specific question and rephrase the FAQ answer to be super helpful.
        3. If the match is low (< 0.6) or the user's intent is ambiguous, PRIORITIZE asking a clarifying question over providing a potentially irrelevant answer. Your goal is to narrow down their needs before giving a definitive response. You can still offer the most relevant info you found as a possibility, but lead with the question.
        4. If the user's query is too broad (e.g., just saying "help" or "products"), ask them to specify what they're looking for.
        5. Always stay positive and encouraging.
        6. If they ask a follow-up, keep the conversation flowing naturally.`,
      },
    });
    setChatSession(session);
  };

  // Initialize Gemini Chat Session
  useEffect(() => {
    createNewSession();
  }, []);

  // Initialize Theme and History
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    const savedHistory = localStorage.getItem(STORAGE_KEY);
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        const loadedMessages = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
        setMessages(loadedMessages);
        if (loadedMessages.length > 0) {
          // Set currentChatId to the latest message's chatId
          setCurrentChatId(loadedMessages[loadedMessages.length - 1].chatId);
        } else {
          setInitialMessage();
        }
      } catch (e) {
        setInitialMessage();
      }
    } else {
      setInitialMessage();
    }
  }, []);

  // Sync History
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  const setInitialMessage = (chatId: string = currentChatId) => {
    const welcomeMsg: Message = {
      id: `welcome-${chatId}`,
      chatId: chatId,
      type: 'bot',
      text: "Welcome to TechCorp Support! I'm your AI assistant. How can I help you with our products, security, or career opportunities today?",
      timestamp: new Date()
    };
    setMessages(prev => [...prev, welcomeMsg]);
  };

  const startNewChat = () => {
    const newChatId = Date.now().toString();
    setCurrentChatId(newChatId);
    setInitialMessage(newChatId);
    createNewSession();
    setIsHistoryOpen(false);
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(THEME_KEY, 'light');
    }
  };

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setInitialMessage();
    setShowResetConfirm(false);
    createNewSession();
  };

  const downloadChat = (id?: string) => {
    let chatToDownload = messages;
    if (id) {
      // Find the message and all preceding messages
      const index = messages.findIndex(m => m.id === id);
      if (index !== -1) {
        chatToDownload = messages.slice(0, index + 1);
      }
    }

    const chatText = chatToDownload.map(m => {
      const time = m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${m.type === 'user' ? 'USER' : 'ASSISTANT'}: ${m.text}`;
    }).join('\n\n');

    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techcorp-chat-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(msgId);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleFeedback = (msgId: string, type: 'helpful' | 'unhelpful') => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedback: type } : m));
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      chatId: currentChatId,
      type: 'user',
      text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Direct call to FAQ backend - intent and string formatting is now handled cleanly on the server
      const data = await askFaq(text);
      
      const isFallback = data.intentHint === "Fallback" || data.confidence === "low";

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        chatId: currentChatId,
        type: 'bot',
        text: data.answer,
        faq: data.faq,
        suggestions: data.suggestedFaqs,
        isFallback: isFallback,
        score: data.score,
        matchedQuestion: data.faq?.question,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        chatId: currentChatId,
        type: 'bot',
        text: "I couldn't find an exact answer right now. Please try again later.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const deleteHistoryItem = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const scrollToMessage = (id: string) => {
    const tryScroll = () => {
      const element = document.getElementById(`msg-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedMessage(id);
        setTimeout(() => setHighlightedMessage(null), 2000);
        if (window.innerWidth < 1024) {
          setIsHistoryOpen(false);
        }
        return true;
      }
      return false;
    };

    if (!tryScroll()) {
      // If not found, try again after a tick (useful when switching chats)
      setTimeout(tryScroll, 100);
    }
  };

  const startVoiceInput = async () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    setVoiceStatus('initializing');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const SpeechGrammarList = (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList;

    if (!SpeechRecognition) {
      setVoiceStatus('idle');
      const errorMsg: Message = {
        id: Date.now().toString(),
        chatId: currentChatId,
        type: 'bot',
        text: "I'm sorry, but your browser doesn't support voice input. This feature works best in the latest versions of Chrome, Edge, or Safari.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
      return;
    }

    // Try to get microphone access first to trigger the permission prompt early
    const hasPermission = await startAudioMonitoring();
    if (!hasPermission && !isRecording) {
      setVoiceStatus('idle');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    // Advanced Configuration for Robustness
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true; // Set to true for better handling of pauses
    recognition.maxAlternatives = 3;

    // Add Grammar List for Domain Keywords to improve accuracy in noisy environments
    if (SpeechGrammarList) {
      const keywords = [
        'TechCorp', 'NovaAnalytics', 'SkyVault', 'TechSum', 'Elena Vance', 
        'support', 'billing', 'careers', 'security', 'API', 'integration',
        'password', 'reset', 'subscription', 'invoice', 'internship',
        'Silicon Valley', 'California', 'London', 'Tokyo', 'Bangalore',
        'encryption', 'GDPR', 'CCPA', 'PayPal', 'TypeScript', 'Python', 'Go', 'Rust',
        'Slack', 'Microsoft Teams', 'Jira', 'SLA', 'uptime'
      ];
      const grammar = '#JSGF V1.0; grammar keywords; public <keyword> = ' + keywords.join(' | ') + ' ;';
      const speechRecognitionList = new SpeechGrammarList();
      speechRecognitionList.addFromString(grammar, 1);
      recognition.grammars = speechRecognitionList;
    }

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      }, 3000); // Stop after 3 seconds of silence
    };

    recognition.onstart = () => {
      setIsRecording(true);
      setVoiceStatus('listening');
      setInterimTranscript('');
      resetSilenceTimer();
    };

    recognition.onresult = (event: any) => {
      resetSilenceTimer();
      let interim = '';
      let final = '';
      let bestConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          let bestAlt = result[0];
          for (let j = 1; j < result.length; j++) {
            if (result[j].confidence > bestAlt.confidence) {
              bestAlt = result[j];
            }
          }
          final += bestAlt.transcript;
          bestConfidence = bestAlt.confidence;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        setVoiceStatus('processing');
        if (bestConfidence < 0.3) {
          console.warn("Low confidence voice transcript:", final, bestConfidence);
        }
        setInput(prev => prev + (prev ? ' ' : '') + final);
        setInterimTranscript('');
        // Brief delay to show "processing" before going back to listening or ending
        setTimeout(() => setVoiceStatus('listening'), 500);
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
      setVoiceStatus('idle');
      setInterimTranscript('');
      stopAudioMonitoring();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      const errorMessages: Record<string, string> = {
        'not-allowed': "I couldn't access your microphone. Please click the lock icon in your browser's address bar and ensure microphone access is allowed for this site.",
        'no-speech': "I didn't hear anything. Could you please try again?",
        'network': "There was a network error with the speech recognition service. Please check your connection.",
        'audio-capture': "I couldn't capture any audio. Please check if your microphone is properly connected and selected in your system settings.",
      };

      if (errorMessages[event.error]) {
        const errorMsg: Message = {
          id: Date.now().toString(),
          chatId: currentChatId,
          type: 'bot',
          text: errorMessages[event.error],
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      setVoiceStatus('idle');
      setInterimTranscript('');
      recognitionRef.current = null;
      stopAudioMonitoring();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Recognition start failed:", e);
      setIsRecording(false);
      setVoiceStatus('idle');
      stopAudioMonitoring();
    }
  };

  const startAudioMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setAudioLevel(average);
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
      return true;
    } catch (err: any) {
      console.error("Error monitoring audio level:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        const errorMsg: Message = {
          id: Date.now().toString(),
          chatId: currentChatId,
          type: 'bot',
          text: "Microphone access was denied. Please enable it in your browser settings (usually by clicking the lock icon next to the URL) and try again.",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      }
      return false;
    }
  };

  const stopAudioMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const getBotResponse = (userMsgId: string) => {
    const index = messages.findIndex(m => m.id === userMsgId);
    if (index !== -1 && index + 1 < messages.length) {
      const nextMsg = messages[index + 1];
      if (nextMsg.type === 'bot') return nextMsg;
    }
    return null;
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'General': return <Info className="w-3 h-3" />;
      case 'Employment': return <Briefcase className="w-3 h-3" />;
      case 'Products': return <Package className="w-3 h-3" />;
      case 'Security': return <ShieldCheck className="w-3 h-3" />;
      case 'Billing': return <CreditCard className="w-3 h-3" />;
      case 'Technical': return <Cpu className="w-3 h-3" />;
      default: return <MessageSquare className="w-3 h-3" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 flex flex-col font-sans text-slate-900 dark:text-slate-100">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors mr-2"
            title="View History"
          >
            <History className="w-5 h-5" />
          </button>
          <TechCorpLogo className="shadow-lg shadow-indigo-200 dark:shadow-none" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">TechCorp <span className="text-indigo-600">Assistant</span></h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Smart FAQ System</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="md:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto relative flex gap-8 p-6 overflow-hidden">
        {/* Mobile History Backdrop */}
        <AnimatePresence>
          {isHistoryOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* Sidebar - Chat History */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-[60] w-80 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 transition-transform duration-300 lg:absolute lg:h-full lg:z-40",
          isHistoryOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Mobile Close Button */}
          <div className="flex items-center justify-between lg:hidden mb-2">
            <h2 className="text-lg font-bold">History</h2>
            <button 
              onClick={() => setIsHistoryOpen(false)}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Chat History
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => downloadChat()}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
                  title="Download all chats"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={startNewChat}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
                  title="Start new chat"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">
                  {messages.filter(m => m.type === 'user').length}
                </span>
              </div>
            </h3>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text"
                placeholder="Search history..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-[11px] bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all"
              />
              {historySearch && (
                <button 
                  onClick={() => setHistorySearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {(() => {
                const filteredHistory = messages.reduce((acc: Message[], msg) => {
                  if (msg.type === 'user' && !acc.find(s => s.chatId === msg.chatId)) {
                    acc.push(msg);
                  }
                  return acc;
                }, []).filter(msg => {
                  if (!historySearch) return true;
                  const botResp = getBotResponse(msg.id);
                  const searchLower = historySearch.toLowerCase();
                  return msg.text.toLowerCase().includes(searchLower) || 
                         (botResp?.text.toLowerCase().includes(searchLower));
                });

                if (filteredHistory.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800">
                        <History className="w-6 h-6 text-slate-300" />
                      </div>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                        {historySearch ? "No matches found" : "No history yet"}
                      </p>
                      <p className="text-[10px] text-slate-400/60 mt-1">
                        {historySearch ? "Try a different keyword" : "Your conversations will appear here"}
                      </p>
                    </div>
                  );
                }

                return filteredHistory.slice().reverse().map((msg) => {
                  const botResp = getBotResponse(msg.id);
                  return (
                    <div key={msg.id} className="relative group">
                      <div 
                        onClick={() => {
                          setCurrentChatId(msg.chatId);
                          scrollToMessage(msg.id);
                        }}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border transition-all hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer relative overflow-hidden",
                          currentChatId === msg.chatId 
                            ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-900/50 shadow-md" 
                            : "bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border-slate-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900/30"
                        )}
                      >
                        {/* Hover Glow Effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <div className="flex items-start gap-3 relative z-10">
                          <div className={cn(
                            "mt-0.5 p-2 rounded-xl transition-all shadow-sm shrink-0",
                            botResp?.faq 
                              ? "bg-white dark:bg-slate-800 text-indigo-500 group-hover:scale-110 group-hover:rotate-3" 
                              : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                          )}>
                            {getCategoryIcon(botResp?.faq?.category)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="text-[8px] font-bold text-indigo-500/60 dark:text-indigo-400/60 uppercase tracking-widest">
                                {botResp?.faq?.category || 'General'}
                              </span>
                              {botResp?.isFallback && (
                                <span className="w-1 h-1 rounded-full bg-amber-400" title="Fallback response" />
                              )}
                            </div>
                            
                            {/* User Message with Icon */}
                            <div className="flex items-start gap-2 mb-1">
                              <User className="w-3 h-3 text-slate-300 shrink-0 mt-0.5" />
                              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 leading-relaxed group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {msg.text}
                              </p>
                            </div>

                            {/* Bot Preview on Hover */}
                            {botResp && (
                              <div className="hidden group-hover:flex items-start gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 animate-in fade-in slide-in-from-top-1 duration-300">
                                <Sparkles className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 italic leading-normal">
                                  {botResp.text}
                                </p>
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadChat(msg.id);
                                  }}
                                  className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg text-slate-400 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                                  title="Download this chat"
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                                <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </aside>

        {/* Chat Section */}
        <section className={cn(
          "flex flex-col flex-1 h-[calc(100vh-160px)] bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-300",
          isHistoryOpen ? "lg:ml-80" : "ml-0"
        )}>
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
          >
            <AnimatePresence initial={false}>
              {messages.filter(m => m.chatId === currentChatId).map((msg) => (
                <motion.div
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    scale: highlightedMessage === msg.id ? 1.02 : 1,
                    backgroundColor: highlightedMessage === msg.id ? (isDarkMode ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.05)') : 'transparent'
                  }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "flex items-start gap-4 p-2 rounded-3xl transition-colors",
                    msg.type === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                    msg.type === 'user' ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-indigo-600"
                  )}>
                    {msg.type === 'user' ? <User className="w-6 h-6" /> : <TechCorpLogo className="w-6 h-6" />}
                  </div>
                  
                  <div className={cn(
                    "max-w-[85%] space-y-3",
                    msg.type === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "p-5 rounded-3xl text-sm leading-relaxed relative group/msg shadow-sm",
                      msg.type === 'user' 
                        ? "bg-indigo-600 text-white rounded-tr-none" 
                        : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none"
                    )}>
                      <div className="flex flex-col gap-2">
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        
                        {msg.type === 'bot' && msg.score !== undefined && (
                          <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-indigo-500/80 dark:text-indigo-400/60">
                              <Zap className="w-2.5 h-2.5" />
                              Match: {Math.round(msg.score * 100)}%
                            </div>
                            {msg.matchedQuestion && msg.score < 0.95 && (
                              <div className="text-[9px] text-slate-400 italic truncate max-w-[120px]">
                                Ref: "{msg.matchedQuestion}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {msg.type === 'bot' && msg.id !== 'welcome' && (
                        <div className="absolute -bottom-10 left-0 flex items-center gap-2 opacity-0 group-hover/msg:opacity-100 transition-all duration-200">
                          <button 
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm"
                          >
                            {copyStatus === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => handleFeedback(msg.id, 'helpful')}
                            className={cn(
                              "p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all shadow-sm",
                              msg.feedback === 'helpful' ? "text-emerald-600 border-emerald-200" : "text-slate-400 hover:text-emerald-600"
                            )}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleFeedback(msg.id, 'unhelpful')}
                            className={cn(
                              "p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all shadow-sm",
                              msg.feedback === 'unhelpful' ? "text-red-600 border-red-200" : "text-slate-400 hover:text-red-600"
                            )}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {msg.suggestions.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(s.question)}
                            className="text-xs p-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm flex items-center gap-2 group"
                          >
                            {s.question}
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all" />
                          </button>
                        ))}
                      </div>
                    )}

                    <span className="text-[10px] font-medium text-slate-400 px-2">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <TechCorpLogo className="w-6 h-6" />
                </div>
                <div className="flex gap-1.5 p-4 bg-slate-100 dark:bg-slate-800 rounded-3xl rounded-tl-none">
                  <span className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            {isRecording && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl text-sm text-indigo-600 dark:text-indigo-400 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {voiceStatus === 'initializing' ? 'Initializing...' : 
                       voiceStatus === 'processing' ? 'Processing...' : 'Listening...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 h-4">
                    {[...Array(8)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ 
                          height: Math.max(4, (audioLevel / 100) * (12 + Math.random() * 8)),
                          backgroundColor: audioLevel > 70 ? '#EF4444' : '#818CF8'
                        }}
                        className="w-1 rounded-full"
                      />
                    ))}
                  </div>
                </div>
                {audioLevel > 85 && (
                  <div className="text-[10px] text-red-500 font-bold uppercase tracking-tighter flex items-center gap-1">
                    <Zap className="w-3 h-3" /> High Background Noise Detected
                  </div>
                )}
                {interimTranscript && (
                  <p className="italic">"{interimTranscript}..."</p>
                )}
              </motion.div>
            )}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="relative flex items-center"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isRecording ? "Listening..." : "Ask about products, security, or careers..."}
                className="w-full p-5 pr-28 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm shadow-inner"
              />
              <div className="absolute right-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={startVoiceInput}
                  className={cn(
                    "p-3.5 rounded-full transition-all shadow-lg relative overflow-hidden",
                    isRecording 
                      ? "bg-red-500 text-white shadow-red-200 dark:shadow-none" 
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 shadow-slate-200 dark:shadow-none"
                  )}
                  title={isRecording ? "Stop Recording" : "Voice Input"}
                >
                  {isRecording && (
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.2 + (audioLevel / 100), 1],
                        opacity: [0.3, 0.1, 0.3]
                      }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="absolute inset-0 bg-white rounded-full"
                    />
                  )}
                  <div className="relative z-10">
                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </div>
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="p-3.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="p-6 text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
        &copy; 2026 TechCorp Global Infrastructure. All Rights Reserved.
      </footer>
    </div>
  );
}
