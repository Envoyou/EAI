'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Upload, Link as LinkIcon, Search, X, FileText, Rocket, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { getApiUrl } from '@/lib/api-url';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUser } from '@clerk/nextjs';

export type SignalData = {
  topic: string;
  internalSignal: 'High' | 'Medium' | 'Low';
  externalSignal: 'Rising' | 'Stable' | 'Declining';
};

export type Recommendation = {
  type: 'write_now' | 'experiment' | 'avoid';
  title: string;
  description: string;
};

export type PreEditorPlan = {
  angle: string;
  audience: string;
  hook: string;
  outline: string;
  seoIntent: string;
  sources: string[];
  draft: string;
};

export type ChatMessageType = 'text' | 'welcome' | 'recommendations' | 'plan';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  type: ChatMessageType;
  content: string;
  payload?: {
    status?: string;
    suggestions?: string[];
    sources?: { url: string; domain: string; title?: string; description?: string }[];
  };
};

interface ContentStrategistWizardProps {
  onComplete: (topic: string, outline: string, draft: string) => void;
  onCancel: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

export default function ContentStrategistWizard({ onComplete, onCancel }: ContentStrategistWizardProps) {
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [chatInput, setChatInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [researchMode, setResearchMode] = useState<'fast' | 'deep'>('fast');
  const [collectedSources, setCollectedSources] = useState<{ url: string; domain: string; title?: string; description?: string }[]>([]);
  const [currentPlan, setCurrentPlan] = useState<PreEditorPlan | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeDeepResearchId, setActiveDeepResearchId] = useState<string | null>(null);
  const [deepResearchReport, setDeepResearchReport] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  useEffect(() => {
    if (!activeDeepResearchId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/strategist/chat/status/${activeDeepResearchId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.state === 'COMPLETED' && data.output) {
            setDeepResearchReport(data.output);
            setActiveDeepResearchId(null);
            
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              type: 'text',
              content: "My Deep Research is complete. I've prepared a comprehensive report for you. Click the report card on the right to view it."
            }]);
            setIsTyping(false);
          } else if (data.state === 'FAILED') {
            setActiveDeepResearchId(null);
            setMessages(prev => [...prev, {
              id: generateId(),
              role: 'assistant',
              type: 'text',
              content: "Deep Research encountered an error and failed to complete."
            }]);
            setIsTyping(false);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeDeepResearchId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isTyping && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isTyping]);


  const appendMessage = (msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: generateId() }]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const loadingToast = toast.loading('Uploading file...');
    setShowAttachMenu(false);
    try {
      const text = await file.text();
      const truncatedText = text.length > 10000 ? text.substring(0, 10000) + '\n...[TRUNCATED]' : text;
      
      toast.success('File attached successfully', { id: loadingToast });
      setChatInput(prev => prev + (prev ? '\n' : '') + `Attached Data (${file.name}):\n\n${truncatedText}\n\nPlease write and execute Python code to load this CSV text using io.StringIO and pandas, then analyze the traffic patterns, bounce rate, or other metrics inside it.\n`);
    } catch {
      toast.error('Failed to attach file', { id: loadingToast });
    }
  };

  const generatePlan = async (recommendationText: string, history: ChatMessage[]) => {
    setIsTyping(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/strategist/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation: recommendationText, history }), 
      });
      
      if (!res.ok) throw new Error('Plan generation failed');
      const data = await res.json();
      if (data.plan) {
        setCurrentPlan(data.plan);
        if (data.plan?.sources && data.plan.sources.length > 0) {
          const fakeDomains = data.plan.sources.map((url: string) => ({ url, domain: 'Source' }));
          setCollectedSources(prev => [...prev, ...fakeDomains]);
        }
      }  
      appendMessage({
        role: 'assistant',
        type: 'text',
        content: data.reply,
        payload: { suggestions: data.suggestions }
      });
    } catch {
      toast.error('Failed to generate draft plan');
      appendMessage({ role: 'assistant', type: 'text', content: 'I failed to generate the plan. Please try selecting it again.' });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async (forcedText?: string) => {
    const textToSend = forcedText ?? chatInput;
    if (!textToSend.trim()) return;

    if (textToSend === 'Proceed to Editor' && currentPlan) {
      onComplete(currentPlan.angle, currentPlan.outline, currentPlan.draft);
      return;
    }

    if (!forcedText) {
      setChatInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
    setIsTyping(true);
    setShowAttachMenu(false);

    let messageText = textToSend;
    if (textToSend === 'Revise Blueprint') {
      messageText = "I want to revise the blueprint with different data. Please forget the previous draft idea.";
      setCurrentPlan(null);
    }

    const newMsg: ChatMessage = { id: generateId(), role: 'user', type: 'text', content: messageText };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);

    if (messageText.toLowerCase().startsWith('draft')) {
      generatePlan(messageText, updatedMessages);
      return;
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/strategist/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, mode: researchMode }),
      });
      
      // Auto-revert to fast mode so they can chat normally while Deep Research runs in background
      if (researchMode === 'deep') {
        setResearchMode('fast');
      }

      if (!res.ok) throw new Error('API Error');
      if (!res.body) throw new Error('No body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      const assistantMsgId = generateId();
      
      setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', type: 'text', content: '' }]);
      
      let currentContent = '';
      let buffer = '';
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const dataStr = line.trim().slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'deep_research_started') {
                   setActiveDeepResearchId(data.interaction_id);
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, status: "Deep Research in progress (this may take up to 30 minutes)..." } } : m));
                } else if (data.type === 'status') {
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, status: data.message } } : m));
                 } else if (data.type === 'text') {
                   // eslint-disable-next-line react-hooks/immutability
                   currentContent += data.chunk;
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent, payload: { ...m.payload, status: undefined } } : m));
                 } else if (data.type === 'replace_text') {
                   currentContent = data.text;
                   setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent, payload: { ...m.payload, status: undefined } } : m));
                } else if (data.type === 'sources') {
                   if (data.sources && data.sources.length > 0) {
                     setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, payload: { ...m.payload, sources: data.sources } } : m));
                   }
                }
              } catch {
              }
            }
          }
        }
      }

      const sugMatch = currentContent.match(/\[SUGGESTIONS:\s*([\s\S]*?)\]/);
      if (sugMatch) {
         const extractedSuggestions = sugMatch[1].split('|').map(s => s.trim());
         currentContent = currentContent.replace(sugMatch[0], '').trim();
         setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: currentContent, payload: { ...m.payload, suggestions: extractedSuggestions } } : m));
      }
      
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-[var(--background)] flex flex-col animate-in fade-in zoom-in-95 duration-200 z-50">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <button 
            onClick={onCancel} 
            className="absolute top-4 right-4 z-50 p-2.5 bg-[var(--surface-1)]/50 hover:bg-[var(--surface-2)] backdrop-blur-md rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>
          
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <h2 className="text-3xl font-bold mb-8">Hi {user?.firstName || 'there'}, what shall we build?</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl">
                {['Analyze my blog data', 'Research industry trends', 'Brainstorm content ideas'].map((s) => (
                    <button key={s} onClick={() => handleSend(s)} className="px-6 py-3 rounded-full hover:bg-[var(--surface-3)] transition-all text-center">
                      <p className="font-medium text-[var(--foreground)]">{s}</p>
                    </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
              <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8 pb-10">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      {msg.payload?.status && (
                        <div className="px-5 py-3.5 flex gap-3 items-center shadow-sm w-fit mb-2">
                          <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--primary)]"></span>
                          </div>
                          <span className="text-[14px] text-[var(--muted-foreground)] font-medium animate-pulse">{msg.payload.status}</span>
                        </div>
                      )}

                      {msg.content && (
                        <div className={`max-w-[85%] text-[15px] leading-relaxed break-words ${
                          msg.role === 'user' 
                            ? 'bg-[var(--surface-2)] text-[var(--foreground)] rounded-3xl px-5 py-3 shadow-sm whitespace-pre-wrap' 
                            : 'bg-transparent text-[var(--foreground)] py-2'
                        }`}>
                          {msg.role === 'assistant' ? (
                            <>
                              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-[var(--foreground)] prose-a:bg-[var(--surface-3)] prose-a:text-[var(--foreground)] prose-a:px-1.5 prose-a:py-0.5 prose-a:rounded-md prose-a:no-underline prose-a:text-[11px] prose-a:font-medium text-[var(--foreground)]">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content + (isTyping && i === messages.length-1 ? ' ▍' : '')}
                                </ReactMarkdown>
                              </div>
                              {msg.payload?.sources && (
                                <div className="flex items-center gap-3 mt-4 mb-2">
                                  <button onClick={() => setCollectedSources(msg.payload!.sources!)} className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-all border border-[var(--border)]">
                                    <span className="text-[13px]">{msg.payload.sources.length} sources</span>
                                  </button>
                                </div>
                              )}
                              {msg.payload?.suggestions && (
                                <div className="flex flex-col items-start gap-2 mt-4">
                                  {msg.payload.suggestions.map((sug: string, i: number) => (
                                    <button key={i} onClick={() => handleSend(sug)} className="text-left py-1.5 px-4 rounded-full bg-[var(--surface-2)]/80 hover:bg-[var(--surface-3)] transition-colors text-sm font-medium border border-[var(--border)]">
                                      {sug}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  <div key="messages-end" ref={messagesEndRef} className="h-4" />
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="p-4 bg-[var(--background)] pb-6 z-10 relative">
            <div className="max-w-4xl mx-auto">
              {/* Actions & Research Mode Toggle */}
              <div className="flex justify-center mb-3 gap-3">
                <div className="bg-[var(--surface-2)] p-1 rounded-full inline-flex items-center">
                    <button onClick={() => setResearchMode('fast')} className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${researchMode === 'fast' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
                      <Rocket className="w-3.5 h-3.5" /> Fast Research
                    </button>
                    <button onClick={() => setResearchMode('deep')} className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${researchMode === 'deep' ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
                      <Search className="w-3.5 h-3.5" /> Deep Research
                    </button>
                </div>
                {messages.length >= 2 && !currentPlan && (
                  <button 
                    onClick={() => {
                      const newMsg: ChatMessage = { id: generateId(), role: 'user', type: 'text', content: "Generate the final blueprint based on our discussion." };
                      const updatedMessages = [...messages, newMsg];
                      setMessages(updatedMessages);
                      generatePlan("Generate the final blueprint based on our discussion.", updatedMessages);
                    }}
                    disabled={isTyping}
                    className="bg-[var(--primary)] text-[var(--background)] px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Generate Blueprint
                  </button>
                )}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className={`w-full max-w-xl mx-auto relative flex flex-col bg-[var(--surface-2)] rounded-3xl p-1 transition-all shadow-sm ${isExpanded ? 'min-h-[100px]' : ''}`}>
                
                {/* When NOT expanded, buttons are absolute and text is centered horizontally */}
                {!isExpanded && (
                  <>
                    <div className="absolute left-[8px] bottom-[8px] z-10">
                      <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="w-9 h-9 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] rounded-full transition-colors flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                      </button>
                      
                      <AnimatePresence>
                        {showAttachMenu && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 mb-2 w-48 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden py-1 z-50">
                            <button type="button" onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                <Upload className="w-4 h-4" /> Upload CSV
                            </button>
                            <button type="button" onClick={() => { setChatInput(prev => prev + (prev ? '\n' : '') + 'Please use the url_context tool to read and analyze my blog at: https://'); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                <LinkIcon className="w-4 h-4" /> Blog URL
                            </button>
                            <button type="button" onClick={() => { setChatInput(prev => prev + (prev ? '\n' : '') + 'Here are my manual metrics:\n- Page views: \n- Bounce rate: '); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                <FileText className="w-4 h-4" /> Manual Metrics
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    </div>
                    
                    <button 
                      type="submit" 
                      disabled={!chatInput.trim() || isTyping} 
                      className="absolute right-[8px] bottom-[8px] w-9 h-9 rounded-full bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 disabled:opacity-30 transition-opacity shadow-sm flex items-center justify-center z-10"
                    >
                      <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
                    </button>
                  </>
                )}

                <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={e => {
                    setChatInput(e.target.value);
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      const newHeight = textareaRef.current.scrollHeight;
                      textareaRef.current.style.height = `${newHeight}px`;
                      setIsExpanded(newHeight > 50 || e.target.value.includes('\n'));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                      setIsExpanded(false);
                    }
                  }}
                  placeholder="Ask your ideas.."
                  className={`w-full block bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none outline-none resize-none min-h-[44px] max-h-[200px] text-[15px] ${isExpanded ? 'py-2 px-3 pb-1' : 'py-2.5 pl-[48px] pr-[48px]'}`}
                  rows={1}
                  disabled={isTyping}
                  autoFocus
                />

                {/* When EXPANDED, buttons are in a separate row at the bottom, so text goes above them */}
                {isExpanded && (
                  <div className="flex justify-between items-center w-full mt-1 px-0.5 pb-0.5">
                    <div className="relative">
                      <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="w-9 h-9 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] rounded-full transition-colors flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                      </button>
                      
                      <AnimatePresence>
                        {showAttachMenu && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 mb-2 w-48 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden py-1 z-50">
                            <button type="button" onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                <Upload className="w-4 h-4" /> Upload CSV
                            </button>
                            <button type="button" onClick={() => { setChatInput(prev => prev + (prev ? '\n' : '') + 'Please use the url_context tool to read and analyze my blog at: https://'); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                <LinkIcon className="w-4 h-4" /> Blog URL
                            </button>
                            <button type="button" onClick={() => { setChatInput(prev => prev + (prev ? '\n' : '') + 'Here are my manual metrics:\n- Page views: \n- Bounce rate: '); setShowAttachMenu(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-2)] flex items-center gap-2">
                                <FileText className="w-4 h-4" /> Manual Metrics
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    </div>
                    
                    <button 
                      type="submit" 
                      disabled={!chatInput.trim() || isTyping} 
                      className="w-9 h-9 rounded-full bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 disabled:opacity-30 transition-opacity shadow-sm flex items-center justify-center"
                    >
                      <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </form>
              <div className="text-center mt-2">
                <span className="text-[9px] text-[var(--muted-foreground)] uppercase tracking-wider font-semibold">EAI can make mistakes. Check important info.</span>
              </div>
            </div>
          </div>
        </div>
        {/* Blueprint Panel */}
        {currentPlan && (
          <div className="w-full lg:w-96 border-l border-[var(--border)] flex absolute lg:relative inset-y-0 right-0 flex-col animate-in slide-in-from-right duration-300 bg-[var(--background)] z-50 lg:z-10 shadow-2xl lg:shadow-none">
            <div className="p-4 flex items-center justify-between shrink-0 border-b border-[var(--border)]">
              <h3 className="font-semibold text-[14px] flex items-center gap-2 text-[var(--foreground)]">
                <FileText className="w-4 h-4" />
                Draft Blueprint
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div>
                <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">Angle / Topic</span>
                <p className="text-[14px] text-[var(--foreground)] font-medium leading-relaxed">{currentPlan.angle}</p>
              </div>

              <div>
                <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">Target Audience</span>
                <p className="text-[13px] text-[var(--foreground)] leading-relaxed">{currentPlan.audience}</p>
              </div>

              {currentPlan.seoIntent && (
                <div>
                  <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">SEO Intent</span>
                  <div className="inline-block px-2.5 py-1 bg-[var(--surface-2)] text-[var(--foreground)] rounded-md text-[12px] font-medium border border-[var(--border)]">
                    {currentPlan.seoIntent}
                  </div>
                </div>
              )}

              <div>
                <span className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-3 block">Outline Structure</span>
                <div className="space-y-2">
                  {currentPlan.outline.split('\n').filter((line: string) => line.trim()).map((line: string, i: number) => (
                    <div key={i} className="flex gap-3 items-start p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--foreground)] text-[var(--background)] text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <span className="text-[13px] text-[var(--foreground)] leading-relaxed">{line.replace(/^-\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-1)] shrink-0 flex flex-col gap-2">
              <button
                onClick={() => onComplete(currentPlan.angle, currentPlan.outline, currentPlan.draft)}
                className="w-full py-2.5 bg-[var(--foreground)] text-[var(--background)] font-medium text-[14px] rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Rocket className="w-4 h-4" />
                Proceed to Editor
              </button>
              <button
                onClick={() => {
                  setCurrentPlan(null);
                  const newMsg: ChatMessage = { id: generateId(), role: 'user', type: 'text', content: "I want to revise the blueprint with different data. Please forget the previous draft idea." };
                  setMessages(prev => [...prev, newMsg]);
                  generatePlan("Revise the blueprint with new instructions.", [...messages, newMsg]);
                }}
                className="w-full py-2.5 bg-transparent text-[var(--foreground)] border border-[var(--border)] font-medium text-[13px] rounded-lg hover:bg-[var(--surface-2)] transition-colors"
              >
                Revise Blueprint
              </button>
            </div>
          </div>
        )}

        {/* Sources Panel */}
        {collectedSources.length > 0 && !currentPlan && (
          <div className="w-80 border-l border-[var(--border)] hidden lg:flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-[13px] flex items-center gap-2">
                <Search className="w-4 h-4 text-[var(--primary)]" />
                Research Sources
              </h3>
              <button onClick={() => setCollectedSources([])} className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] rounded-md transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2">
              {collectedSources.map((source, i) => {
                try {
                  const domain = source.domain;
                  // Use dummy content if title/description are missing to match the requested premium layout
                  const title = source.title || `Artikel terkait dari ${domain}`;
                  const description = source.description || source.url;
                  
                  return (
                    <a key={i} href={source.url} target="_blank" rel="noreferrer" className="flex flex-col gap-1.5 p-3 rounded-xl hover:bg-[var(--surface-2)] transition-colors group">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} className="w-4 h-4 rounded-full" alt={domain} />
                        <span className="text-[12px] text-[var(--muted-foreground)] font-medium">{domain}</span>
                      </div>
                      <h4 className="text-[14px] font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors leading-snug">{title}</h4>
                      <p className="text-[13px] text-[var(--muted-foreground)] line-clamp-3 leading-relaxed">{description}</p>
                    </a>
                  );
                } catch {
                  return null;
                }
              })}
            </div>
          </div>
        )}
        
        {/* Deep Research Small Card / NotebookLM Studio Style */}
        {deepResearchReport && !collectedSources.length && !currentPlan && (
          <div className="w-80 border-l border-[var(--border)] hidden lg:flex flex-col animate-in slide-in-from-right duration-300 bg-[var(--surface-1)]">
            <div className="p-4">
              <h3 className="font-semibold text-[13px] flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-[var(--primary)]" />
                Research Report
              </h3>
              
              <button 
                onClick={() => setIsReportOpen(true)}
                className="w-full text-left p-4 rounded-xl bg-gradient-to-br from-[var(--surface-2)] to-[var(--background)] border border-[var(--border)] hover:border-[var(--primary)]/50 hover:shadow-md transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--primary)]/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                <h4 className="font-semibold text-[15px] mb-2 text-[var(--foreground)] relative z-10 flex items-center gap-2">
                  Comprehensive Analysis
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
                </h4>
                <p className="text-[13px] text-[var(--muted-foreground)] line-clamp-3 leading-relaxed relative z-10">
                  {deepResearchReport.replace(/[#*`]/g, '').slice(0, 120)}...
                </p>
                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between relative z-10">
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Status: Complete</span>
                  <span className="text-[12px] font-medium text-[var(--primary)] flex items-center gap-1 group-hover:underline">
                    View Full
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Screen Deep Research Modal */}
      <AnimatePresence>
        {isReportOpen && deepResearchReport && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[var(--background)] w-full max-w-5xl h-full max-h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border)] relative"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[var(--border)] bg-[var(--surface-1)] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg">
                    <Rocket className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Deep Research Report</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">Generated by EAI Copilot</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsReportOpen(false)}
                  className="p-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-[var(--background)]">
                <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-4xl mx-auto prose-headings:text-[var(--foreground)] prose-p:leading-relaxed prose-a:text-[var(--primary)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {deepResearchReport}
                  </ReactMarkdown>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
