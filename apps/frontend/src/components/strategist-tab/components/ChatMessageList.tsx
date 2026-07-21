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
  List,
} from 'lucide-react';
import { shouldShowAssistantSpinner } from '@/lib/strategist-stream';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { extractDynamicSuggestions, normalizeStrategistMarkdown } from '@/lib/strategist-utils';
import type { ChatMessage } from '@/lib/hooks/useContentStrategist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerVisibility,
  useMessageScrollerScrollable,
} from '@/components/ui/message-scroller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessageListProps {
  messages: ChatMessage[];
  isTyping: boolean;
  copiedMessageId: string | null;
  handleSend: (forcedText?: string) => void;
  handleRewrite: (msgId: string) => void;
  handleCopy: (text: string, msgId: string) => void;
  saveNote: (msg: ChatMessage) => void;
}

// ---------------------------------------------------------------------------
// ChatPositionIndicator — tracks the reader's position in the conversation.
// Shows a subtle badge when the user has scrolled away from the latest message.
// Uses useMessageScrollerVisibility (which turn is in view) and
// useMessageScrollerScrollable (whether there is content below the viewport).
// ---------------------------------------------------------------------------

function ChatPositionIndicator() {
  // end=true means the scroller is at the bottom edge — no need for indicator.
  const { end } = useMessageScrollerScrollable();
  // currentAnchorId is set to the message id of the currently anchored turn.
  const { currentAnchorId } = useMessageScrollerVisibility();

  if (end || !currentAnchorId) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[9px] text-[var(--muted-foreground)] font-mono animate-fade-in select-none">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse shrink-0" />
      scrolling
    </span>
  );
}

// ---------------------------------------------------------------------------
// TranscriptOutline — Interactive outline allowing readers to track current turn
// and jump directly to any anchored user question in the conversation.
// ---------------------------------------------------------------------------

function TranscriptOutline({ messages }: { messages: ChatMessage[] }) {
  const [open, setOpen] = useState(false);
  const { currentAnchorId } = useMessageScrollerVisibility();
  const { scrollToMessage } = useMessageScroller();

  const userMessages = messages.filter((m) => m.role === 'user');

  if (userMessages.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="text-[10px] gap-1 text-[var(--foreground)]"
          >
            <List className="w-3 h-3 text-[var(--primary)] shrink-0" />
            <span>Outline</span>
            <span className="px-1 py-0.2 rounded-full bg-[var(--surface-3)] text-[9px] font-mono text-[var(--muted-foreground)]">
              {userMessages.length}
            </span>
          </Button>
        }
      />
      <PopoverContent
        side="bottom"
        align="end"
        className="w-72 p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl shadow-xl z-50"
      >
        <div className="mb-2 pb-1.5 border-b border-[var(--border)]">
          <div className="font-semibold text-xs text-[var(--foreground)]">
            Transcript Outline
          </div>
          <div className="text-[10px] text-[var(--muted-foreground)]">
            Track active turn & jump to messages
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {userMessages.map((msg, index) => {
            const isCurrent = currentAnchorId === msg.id;
            return (
              <button
                key={msg.id}
                type="button"
                onClick={() => {
                  scrollToMessage(msg.id, { align: 'start', behavior: 'smooth' });
                  setOpen(false);
                }}
                className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-start gap-2 ${
                  isCurrent
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium border border-[var(--primary)]/20'
                    : 'hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="text-[10px] font-mono text-[var(--muted-foreground)] opacity-60 shrink-0 mt-0.5">
                  #{index + 1}
                </span>
                <span className="truncate flex-1 text-[11px] leading-snug">
                  {msg.content}
                </span>
                {isCurrent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0 mt-1.5 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// ChatMessageList — scroll container orchestration.
// Delegates scroll behavior to MessageScroller and message rendering to
// ChatMessageRow. Do not add business logic here.
// ---------------------------------------------------------------------------

export function ChatMessageList({
  messages,
  isTyping,
  copiedMessageId,
  handleSend,
  handleRewrite,
  handleCopy,
  saveNote,
}: ChatMessageListProps) {
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
    <MessageScroller className="flex-1">
      <MessageScrollerViewport>
        <MessageScrollerContent className="p-3">
          {messages.map((msg) => (
            <MessageScrollerItem
              key={msg.id}
              messageId={msg.id}
              // Anchor user turns so the scroller holds the user prompt in view
              // while the assistant streams its response below it.
              scrollAnchor={msg.role === 'user'}
            >
              <ChatMessageRow
                msg={msg}
                isTyping={isTyping}
                copiedMessageId={copiedMessageId}
                handleSend={handleSend}
                handleRewrite={handleRewrite}
                handleCopy={handleCopy}
                saveNote={saveNote}
              />
            </MessageScrollerItem>
          ))}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      {/* Jump-to-latest button — self-managing, appears when user scrolls up */}
      <MessageScrollerButton />
    </MessageScroller>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export { ChatPositionIndicator, TranscriptOutline };

// ---------------------------------------------------------------------------
// ChatMessageRow — renders a single message (user or assistant).
// Extracted from ChatMessageList to keep scroll orchestration separate from
// message rendering logic.
// ---------------------------------------------------------------------------

function ChatMessageRow({
  msg,
  isTyping,
  copiedMessageId,
  handleSend,
  handleRewrite,
  handleCopy,
  saveNote,
}: {
  msg: ChatMessage;
  isTyping: boolean;
  copiedMessageId: string | null;
  handleSend: (forcedText?: string) => void;
  handleRewrite: (msgId: string) => void;
  handleCopy: (text: string, msgId: string) => void;
  saveNote: (msg: ChatMessage) => void;
}) {
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  return (
    <div className="group">
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

          const normalizedContent = normalizeStrategistMarkdown(displayContent);

          return (
            <div className="flex min-w-0 w-full justify-start">
              <div className="w-full min-w-0 max-w-[95%] bg-[var(--background)] border border-[var(--border)] rounded-xl rounded-bl-sm p-2.5 shadow-sm">
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
                    <div
                      className="
                        prose strategist-prose
                        w-full min-w-0 max-w-full
                        text-[var(--foreground)] text-xs
                        break-words [overflow-wrap:anywhere]
                        [&_p]:max-w-full
                        [&_p]:whitespace-normal
                        [&_li]:max-w-full
                        [&_li]:whitespace-normal
                        [&_blockquote]:max-w-full
                        [&_a]:break-words
                        [&_:not(pre)>code]:whitespace-normal
                        [&_:not(pre)>code]:break-words
                      "
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ children, ...props }) => (
                            <div className="my-3 w-full max-w-full overflow-x-auto">
                              <div className="mb-1 text-[9px] text-[var(--muted-foreground)] sm:hidden">
                                Swipe horizontally to view all columns
                              </div>
                              <table
                                {...props}
                                className="w-max min-w-full border-collapse"
                              >
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children, ...props }) => (
                            <th
                              {...props}
                              className="whitespace-normal break-words px-3 py-2 text-left align-top"
                            >
                              {children}
                            </th>
                          ),
                          td: ({ children, ...props }) => (
                            <td
                              {...props}
                              className="whitespace-normal break-words px-3 py-2 align-top"
                            >
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {normalizedContent}
                      </ReactMarkdown>
                    </div>

                    {/* Search Sources/Citations */}
                    {msg.payload?.sources &&
                      msg.payload.sources.length > 0 && (
                        <div className="mt-2 p-1.5 bg-[var(--surface-2)] rounded-lg border border-[var(--border)] text-[10px] animate-fade-in">
                          <Button
                            type="button"
                            onClick={() => toggleSources(msg.id)}
                            variant="muted"
                            size="xs"
                            aria-expanded={expandedSources[msg.id]}
                            className="w-full justify-between text-[var(--muted-foreground)] mb-1 border-none bg-transparent p-0 text-[10px]"
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
                          </Button>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {msg.payload.sources
                              .slice(
                                0,
                                expandedSources[msg.id] ? undefined : 3
                              )
                              .map((src, i) => (
                                <Badge
                                  key={i}
                                  variant="surface"
                                  size="xs"
                                  render={<a href={src.url} target="_blank" rel="noopener noreferrer" />}
                                  className="hover:bg-[var(--surface-4)] hover:text-[var(--primary)] no-underline text-[10px]"
                                  title={src.title || src.url}
                                >
                                  <span className="font-semibold max-w-[120px] truncate">
                                    {src.title || src.domain || 'Link'}
                                  </span>
                                </Badge>
                              ))}

                            {!expandedSources[msg.id] &&
                              msg.payload.sources.length > 3 && (
                                <Button
                                  type="button"
                                  onClick={() => toggleSources(msg.id)}
                                  variant="primary"
                                  size="xs"
                                  className="rounded-full font-bold text-[10px]"
                                >
                                  +{msg.payload.sources.length - 3} more
                                </Button>
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
                                handleCopy(normalizedContent, msg.id)
                              }
                              className="p-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                            >
                              {copiedMessageId === msg.id ? (
                                // Use --success token instead of hardcoded emerald-500
                                <Copy className="w-3.5 h-3.5 text-[var(--success)]" />
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
                              onClick={() =>
                                saveNote({
                                  ...msg,
                                  content: normalizedContent,
                                })
                              }
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
                                const clean = normalizeStrategistMarkdown(
                                  msg.content.replace(
                                    /\[SUGGESTIONS:[\s\S]*?\]/g,
                                    ''
                                  )
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
                          <Button
                            key={i}
                            type="button"
                            onClick={() => handleSend(sug)}
                            disabled={isTyping}
                            variant="surface"
                            size="xs"
                            className="!rounded-full text-[10px]"
                          >
                            {sug}
                          </Button>
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
  );
}
