'use client';

import { useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Copy, Bookmark, Download, RotateCcw, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUser } from '@clerk/nextjs';
import type { ChatMessage } from '@/lib/hooks/useContentStrategist';

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
  onQuickDraftOpen?: () => void;
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
  onQuickDraftOpen,
}: StrategistTabProps) {
  const { user } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

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

  const handleQuickAction = (action: string) => {
    if (action === 'research') {
      setChatInput('research ');
    } else if (action === 'outline') {
      if (onQuickDraftOpen) onQuickDraftOpen();
      else setChatInput('outline ');
    } else if (action === 'draft') {
      setChatInput('draft ');
    }
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Quick Actions */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-[var(--border)]">
        {['Research', 'Outline', 'Draft'].map(label => (
          <button
            key={label}
            onClick={() => handleQuickAction(label.toLowerCase())}
            className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
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
                  <div className="flex justify-start">
                    <div className="max-w-[95%] min-w-0">
                      {msg.payload?.status ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] px-1 py-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{msg.payload.status}</span>
                        </div>
                      ) : (
                        <>
                          <div className="text-xs leading-relaxed prose prose-sm max-w-none text-[var(--foreground)]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>

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
        <div className="relative flex items-end gap-1.5 bg-[var(--surface-2)] rounded-xl p-1.5">
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your article..."
            rows={1}
            disabled={isTyping}
            className="flex-1 resize-none bg-transparent border-none outline-none text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] py-1.5 px-1 min-h-[32px] max-h-[120px]"
          />
          <button
            onClick={() => handleSend()}
            disabled={!chatInput.trim() || isTyping}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--primary)] text-white disabled:opacity-30 transition-opacity cursor-pointer border-none"
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
  );
}