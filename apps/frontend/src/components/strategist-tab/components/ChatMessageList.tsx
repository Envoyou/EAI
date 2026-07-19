'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageSquare,
  Loader2,
  Globe,
  Copy,
  Bookmark,
  Download,
  RotateCcw,
} from 'lucide-react';
import { shouldShowAssistantSpinner } from '@/lib/strategist-stream';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { extractDynamicSuggestions } from '@/lib/strategist-utils';
import type { ChatMessage } from '@/lib/hooks/useContentStrategist';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isTyping: boolean;
  copiedMessageId: string | null;
  handleSend: (forcedText?: string) => void;
  handleRewrite: (msgId: string) => void;
  handleCopy: (text: string, msgId: string) => void;
  saveNote: (msg: ChatMessage) => void;
}

export function ChatMessageList({
  messages,
  isTyping,
  copiedMessageId,
  handleSend,
  handleRewrite,
  handleCopy,
  saveNote,
}: ChatMessageListProps) {
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[var(--muted-foreground)]">
        <MessageSquare className="w-8 h-8 text-[var(--muted-foreground)] opacity-20 mb-3" />
        <p className="text-xs max-w-[240px] leading-relaxed">
          Start a conversation about content strategy, SEO, outlines, or data
          analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className="group">
          {/* User message */}
          {msg.role === 'user' && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-xs bg-[var(--primary)]/10 text-[var(--foreground)]">
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content}
                </p>
              </div>
            </div>
          )}

          {/* Assistant message */}
          {msg.role === 'assistant' &&
            (() => {
              const { displayContent, suggestions: parsedSuggestions } =
                extractDynamicSuggestions(msg.content);
              const finalSuggestions =
                msg.payload?.suggestions || parsedSuggestions || [];

              return (
                <div className="flex justify-start w-full">
                  <div className="max-w-[95%] min-w-0 overflow-hidden bg-[var(--background)] border border-[var(--border)] rounded-xl rounded-bl-sm p-2.5 shadow-sm">
                    {shouldShowAssistantSpinner(msg.payload?.lifecycle, msg.payload?.status) ? (
                      (() => {
                        const statusText = msg.payload?.status ?? '';
                        const isThinkingStatus =
                          statusText.startsWith('Thinking:');
                        const thinkingText = isThinkingStatus
                          ? statusText.replace(/^Thinking:\s*/, '')
                          : '';

                        return (
                          <div className="flex flex-col gap-2 px-1 py-1">
                            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                              <span className="font-medium">
                                {isThinkingStatus ? 'Thinking...' : statusText}
                              </span>
                            </div>
                            {isThinkingStatus && thinkingText && (
                              <div className="mt-1.5 p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[10px] text-[var(--muted-foreground)] font-mono whitespace-pre-wrap leading-relaxed max-h-[140px] overflow-y-auto animate-fade-in shadow-inner">
                                <div className="text-[9px] uppercase tracking-wider font-bold text-[var(--primary)] opacity-90 mb-1 select-none">
                                  Thinking Process
                                </div>
                                {thinkingText}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <>
                        <div className="prose strategist-prose max-w-none text-[var(--foreground)] text-xs">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {displayContent}
                          </ReactMarkdown>
                        </div>

                        {/* Search Sources/Citations */}
                        {msg.payload?.sources &&
                          msg.payload.sources.length > 0 && (
                            <div className="mt-2 p-1.5 bg-[var(--surface-2)] rounded-lg border border-[var(--border)] text-[10px] animate-fade-in">
                              <button
                                type="button"
                                onClick={() => toggleSources(msg.id)}
                                className="w-full flex items-center justify-between font-semibold text-[var(--muted-foreground)] mb-1 hover:text-[var(--foreground)] transition-colors cursor-pointer border-none bg-transparent p-0 text-[10px]"
                              >
                                <div className="flex items-center gap-1 select-none">
                                  <Globe className="w-3 h-3 text-[var(--primary)] shrink-0" />
                                  <span>
                                    Source ({msg.payload.sources.length})
                                  </span>
                                </div>
                                <span className="text-[9px] text-[var(--primary)] font-medium">
                                  {expandedSources[msg.id]
                                    ? 'Hide'
                                    : 'Show All'}
                                </span>
                              </button>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {msg.payload.sources
                                  .slice(
                                    0,
                                    expandedSources[msg.id] ? undefined : 3
                                  )
                                  .map((src, i) => (
                                    <a
                                      key={i}
                                      href={src.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ui-badge ui-badge-surface ui-badge-xs hover:bg-[var(--surface-4)] hover:text-[var(--primary)] transition-colors no-underline text-[10px]"
                                      title={src.title || src.url}
                                    >
                                      <span className="font-semibold max-w-[120px] truncate">
                                        {src.title || src.domain || 'Link'}
                                      </span>
                                    </a>
                                  ))}

                                {!expandedSources[msg.id] &&
                                  msg.payload.sources.length > 3 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleSources(msg.id)}
                                      className="ui-badge ui-badge-primary ui-badge-xs hover:filter hover:brightness-95 transition-all cursor-pointer font-bold text-[10px]"
                                    >
                                      +{msg.payload.sources.length - 3} more
                                    </button>
                                  )}
                              </div>
                            </div>
                          )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-2">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  onClick={() =>
                                    handleCopy(displayContent, msg.id)
                                  }
                                  className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                >
                                  {copiedMessageId === msg.id ? (
                                    <Copy className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              }
                            />
                            <TooltipContent side="bottom" className="text-xs">
                              {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  onClick={() => saveNote(msg)}
                                  className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                >
                                  <Bookmark className="w-3.5 h-3.5" />
                                </button>
                              }
                            />
                            <TooltipContent side="bottom" className="text-xs">
                              Save as note
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  onClick={() => {
                                    const clean = msg.content.replace(
                                      /\[SUGGESTIONS:[\s\S]*?\]/g,
                                      ''
                                    );
                                    const blob = new Blob([clean], {
                                      type: 'text/markdown;charset=utf-8;',
                                    });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'response.md';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                  className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              }
                            />
                            <TooltipContent side="bottom" className="text-xs">
                              Download
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  onClick={() => handleRewrite(msg.id)}
                                  className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              }
                            />
                            <TooltipContent side="bottom" className="text-xs">
                              Rewrite
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        {/* Suggestions */}
                        {finalSuggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {finalSuggestions.map((sug, i) => (
                              <button
                                key={i}
                                onClick={() => handleSend(sug)}
                                disabled={isTyping}
                                className="ui-btn ui-btn-surface ui-btn-xs !rounded-full text-[10px]"
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
              );
            })()}
        </div>
      ))}
    </div>
  );
}
