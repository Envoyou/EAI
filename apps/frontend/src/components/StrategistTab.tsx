'use client';

import { useRef, useEffect, useState } from 'react';
import { ArrowUp, Loader2, Copy, Bookmark, Download, RotateCcw, FileText, Paperclip, X, Globe, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import type { ChatMessage, Attachment } from '@/lib/hooks/useContentStrategist';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface StrategistTabProps {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  isTyping: boolean;
  handleSend: (forcedText?: string) => void;
  handleRewrite: (msgId: string) => void;
  handleCopy: (text: string, msgId: string) => void;
  saveNote: (msg: ChatMessage) => void;
  copiedMessageId: string | null;
  uploadedAttachment: Attachment | null;
  setUploadedAttachment: (attachment: Attachment | null) => void;
  handleFileUpload: (file: File) => Promise<void>;
  enableSearch: boolean;
  setEnableSearch: (v: boolean) => void;
  researchMode: 'fast' | 'deep';
  setResearchMode: (v: 'fast' | 'deep') => void;
  deepResearchReport: string | null;
  clearMessages: () => void;
}

export default function StrategistTab({
  messages,
  chatInput,
  setChatInput,
  isTyping,
  handleSend,
  handleRewrite,
  handleCopy,
  saveNote,
  copiedMessageId,
  uploadedAttachment,
  setUploadedAttachment,
  handleFileUpload,
  enableSearch,
  setEnableSearch,
  researchMode,
  setResearchMode,
  deepResearchReport,
  clearMessages,
}: StrategistTabProps) {
  const { user } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const toggleSources = (msgId: string) => {
    setExpandedSources(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevIsTypingRef = useRef(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShouldAutoScroll(isAtBottom);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const prevIsTyping = prevIsTypingRef.current;
    // Force scroll to bottom on new message stream start, otherwise scroll if user is near bottom
    if (isTyping && !prevIsTyping) {
      el.scrollTop = el.scrollHeight;
      setTimeout(() => setShouldAutoScroll(true), 0);
    } else if (shouldAutoScroll) {
      el.scrollTop = el.scrollHeight;
    }
    prevIsTypingRef.current = isTyping;
  }, [messages, isTyping, shouldAutoScroll]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [chatInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && handleFileUpload) {
      handleFileUpload(file);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Settings & Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] text-xs text-[var(--muted-foreground)] shrink-0">
        <div className="font-semibold text-[var(--foreground)] ml-1">AI Strategist</div>

        <div className="flex items-center gap-1.5">
          {/* View Deep Research Report Button */}
          {deepResearchReport && (
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--primary)] hover:text-[var(--primary)]/80 font-medium cursor-pointer border border-[var(--primary)]/20 text-[10px]"
            >
              <FileText className="w-3 h-3" />
              <span>View Report</span>
            </button>
          )}

          {/* New Chat Button */}
          <button
            type="button"
            onClick={clearMessages}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] font-medium cursor-pointer border border-[var(--border)] text-[10px]"
            title="Start new chat session"
          >
            <Plus className="w-3 h-3 text-[var(--primary)] shrink-0" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <FileText className="w-8 h-8 text-[var(--primary)]/30 mb-3" />
            <p className="text-xs text-[var(--muted-foreground)] font-medium mb-1">
              Hi {user?.firstName || 'there'}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]/70 leading-relaxed">
              Ask me to research a topic, generate an outline, or help with your article.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="group">
                {/* User message */}
                {msg.role === 'user' && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-xs bg-[var(--primary)]/10 text-[var(--foreground)]">
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                )}

                {/* Assistant message */}
                {msg.role === 'assistant' && (
                  <div className="flex justify-start w-full">
                    <div className="max-w-[95%] min-w-0 bg-[var(--background)] border border-[var(--border)] rounded-xl rounded-bl-sm p-2.5 shadow-sm">
                      {msg.payload?.status ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] px-1 py-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{msg.payload.status}</span>
                        </div>
                      ) : (
                        <>
                          <div className="prose strategist-prose max-w-none text-[var(--foreground)]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>

                           {/* Search Sources/Citations */}
                           {msg.payload?.sources && msg.payload.sources.length > 0 && (
                             <div className="mt-2 p-1.5 bg-[var(--surface-2)] rounded-lg border border-[var(--border)] text-[10px] animate-fade-in">
                               <button
                                 type="button"
                                 onClick={() => toggleSources(msg.id)}
                                 className="w-full flex items-center justify-between font-semibold text-[var(--muted-foreground)] mb-1 hover:text-[var(--foreground)] transition-colors cursor-pointer border-none bg-transparent p-0 text-[10px]"
                               >
                                 <div className="flex items-center gap-1 select-none">
                                   <Globe className="w-3 h-3 text-[var(--primary)] shrink-0" />
                                   <span>Sumber Referensi ({msg.payload.sources.length})</span>
                                 </div>
                                 <span className="text-[9px] text-[var(--primary)] font-medium">
                                   {expandedSources[msg.id] ? 'Sembunyikan' : 'Tampilkan Semua'}
                                 </span>
                               </button>
                               <div className="flex flex-wrap gap-1 mt-1">
                                 {msg.payload.sources
                                   .slice(0, expandedSources[msg.id] ? undefined : 3)
                                   .map((src, i) => (
                                     <a
                                       key={i}
                                       href={src.url}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--surface-3)] hover:bg-[var(--surface-4)] text-[var(--foreground)] hover:text-[var(--primary)] transition-colors border border-[var(--border)] no-underline text-[9px]"
                                       title={src.title || src.url}
                                     >
                                       <span className="font-medium max-w-[120px] truncate">
                                         {src.title || src.domain || 'Link'}
                                       </span>
                                     </a>
                                   ))}
                                 
                                 {!expandedSources[msg.id] && msg.payload.sources.length > 3 && (
                                   <button
                                     type="button"
                                     onClick={() => toggleSources(msg.id)}
                                     className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] transition-colors border border-[var(--primary)]/20 cursor-pointer font-semibold text-[9px]"
                                   >
                                     +{msg.payload.sources.length - 3} lainnya
                                   </button>
                                 )}
                               </div>
                             </div>
                           )}

                          {/* Actions */}
                          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleCopy(msg.content, msg.id)}
                              className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)]"
                            >
                              {copiedMessageId === msg.id ? (
                                <Copy className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              onClick={() => saveNote(msg)}
                              className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)]"
                              title="Save as note"
                            >
                              <Bookmark className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                const clean = msg.content.replace(/\[SUGGESTIONS:[\s\S]*?\]/g, '');
                                const blob = new Blob([clean], { type: 'text/markdown;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'response.md';
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)]"
                              title="Download"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleRewrite(msg.id)}
                              className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)]"
                              title="Rewrite"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Suggestions */}
                          {msg.payload?.suggestions && msg.payload.suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {msg.payload.suggestions.map((sug, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleSend(sug)}
                                  disabled={isTyping}
                                  className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer border-none"
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="px-3 py-2 border-t border-[var(--border)]">
        {/* Attachment Preview Chip */}
        {uploadedAttachment && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[var(--surface-3)] rounded-lg text-[10px] text-[var(--foreground)] w-fit mb-2 animate-fade-in border border-[var(--border)]">
            <FileText className="w-3 h-3 text-[var(--primary)] shrink-0" />
            <span className="truncate max-w-[150px] font-medium">{uploadedAttachment.filename}</span>
            <button
              type="button"
              onClick={() => setUploadedAttachment(null)}
              className="p-0.5 rounded hover:bg-[var(--surface-4)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer ml-1"
              title="Remove attachment"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
        <div className="flex flex-col bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-[var(--primary)]/30 focus-within:border-[var(--primary)]/30 transition-all">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.csv,.txt"
            className="hidden"
          />
          
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your article..."
            rows={1}
            disabled={isTyping}
            className="w-full resize-none bg-transparent border-none outline-none text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] px-2 py-1.5 min-h-[44px] max-h-[120px] focus:ring-0"
          />

          <div className="flex items-center justify-between border-t border-[var(--border)]/20 pt-2 mt-1 px-1">
            <div className="flex items-center gap-1.5">
              {/* Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--surface-3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer border-none bg-transparent"
                title="Attach file (PDF, CSV, TXT)"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              {/* Search Web Button */}
              <button
                type="button"
                onClick={() => setEnableSearch(!enableSearch)}
                className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-colors cursor-pointer ${
                  enableSearch
                    ? 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)]'
                }`}
                title={enableSearch ? 'Disable Web Search' : 'Enable Web Search'}
              >
                <Globe className="w-3.5 h-3.5" />
              </button>

              {/* Select Research Mode Trigger */}
              <Select value={researchMode} onValueChange={(val) => { if (val) setResearchMode(val); }}>
                <SelectTrigger
                  size="sm"
                  className="h-7 border border-[var(--border)] bg-transparent hover:bg-[var(--surface-3)] text-[var(--foreground)] hover:text-[var(--foreground)] text-[10px] font-semibold rounded-lg px-2 flex items-center gap-1 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[var(--border)]"
                >
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-1 min-w-[130px] z-50">
                  <SelectItem value="fast" className="text-[10px] cursor-pointer rounded py-1.5 pl-2 pr-8 hover:bg-[var(--surface-2)]">Fast Mode</SelectItem>
                  <SelectItem value="deep" className="text-[10px] cursor-pointer rounded py-1.5 pl-2 pr-8 hover:bg-[var(--surface-2)]">Deep Research</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Send Button */}
            <button
              onClick={() => handleSend()}
              disabled={(!chatInput.trim() && !uploadedAttachment) || isTyping}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--primary)] text-white dark:text-black disabled:opacity-30 transition-opacity cursor-pointer border-none"
            >
              {isTyping ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Deep Research Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] w-full max-w-2xl h-[80vh] rounded-xl flex flex-col shadow-2xl overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-semibold text-sm text-[var(--foreground)]">Deep Research Report</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(deepResearchReport || '');
                    toast.success('Report copied to clipboard!');
                  }}
                  className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer"
                  title="Copy Report"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 text-xs leading-relaxed text-[var(--foreground)] strategist-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {deepResearchReport || ''}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}