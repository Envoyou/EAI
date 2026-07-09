'use client';

import { useRef, useEffect, useState } from 'react';
import { ArrowUp, Loader2, Copy, Bookmark, Download, RotateCcw, FileText, Paperclip, X, Globe, Plus, MessageSquare, Pin, Pencil, Trash2, MoreVertical, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import type { ChatMessage, Attachment, ChatSession } from '@/lib/hooks/useContentStrategist';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { extractDynamicSuggestions } from '@/lib/strategist-utils';
import { Menu } from '@base-ui/react/menu';

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

  currentSessionId: string | null;
  setCurrentSessionId: (v: string | null) => void;
  sessions: ChatSession[];
  isSessionsLoading: boolean;
  selectSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  togglePinSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  startNewChat: () => void;
  onCancelChat?: () => void;
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

  currentSessionId,
  setCurrentSessionId,
  sessions,
  isSessionsLoading,
  selectSession,
  renameSession,
  togglePinSession,
  deleteSession,
  startNewChat,
  onCancelChat,
}: StrategistTabProps) {
  const { user } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

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

  const downloadConversation = () => {
    if (messages.length === 0) {
      toast.error('No messages in this chat session.');
      return;
    }

    const conversationMarkdown = messages
      .map((msg) => {
        const roleName = msg.role === 'user' ? 'User' : 'AI Strategist';
        return `### **${roleName}**\n\n${msg.content}\n\n---\n`;
      })
      .join('\n');

    const blob = new Blob([conversationMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `eai-strategist-chat-${new Date().toISOString().slice(0, 10)}.md`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Conversation downloaded successfully.');
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-1)]">
      {currentSessionId === null ? (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
            <div className="font-bold text-xs text-[var(--foreground)]">EAI Research History</div>
            <button
              type="button"
              onClick={startNewChat}
              className="ui-btn ui-btn-primary ui-btn-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              <span>New Chat</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isSessionsLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)] mb-2" />
                <span className="text-[10px]">Loading history...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 border border-dashed border-[var(--border)] rounded-xl bg-[var(--surface-2)] text-center my-4 mx-2">
                <MessageSquare className="w-8 h-8 text-[var(--muted-foreground)] opacity-40 mb-2.5" />
                <h3 className="text-xs font-semibold text-[var(--foreground)] mb-1">Start New Chat</h3>
                <p className="text-[10px] text-[var(--muted-foreground)] max-w-[200px] mb-3">
                  Ask the AI Strategist for content ideas, SEO outlines, or draft previews.
                </p>
                <button
                  type="button"
                  onClick={startNewChat}
                  className="ui-btn ui-btn-primary ui-btn-xs"
                >
                  <span>Start Chat</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => {
                  return (
                    <div
                      key={s.id}
                      className="group relative flex items-center gap-2 py-1.5 px-2.5 rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-3)]/60 transition-all cursor-pointer"
                      onClick={() => {
                        selectSession(s.id);
                      }}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 justify-between">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {s.isPinned && (
                            <Pin className="w-3 h-3 text-[var(--primary)] fill-current shrink-0" />
                          )}
                          <span className="font-semibold text-xs text-[var(--foreground)] truncate">
                            {s.title}
                          </span>
                        </div>
                        
                        <span className="text-[9px] text-[var(--muted-foreground)] shrink-0 font-medium ml-1">
                          {new Date(s.updatedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>

                      <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                        <Menu.Root>
                          <Menu.Trigger className="opacity-100 md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100 p-1 rounded hover:bg-[var(--surface-3)] transition-all inline-flex text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer border-none bg-transparent">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Menu.Trigger>
                          <Menu.Portal>
                            <Menu.Positioner side="bottom" align="end" sideOffset={4}>
                              <Menu.Popup className="w-36 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-lg z-[200] py-1 text-left outline-none animate-in fade-in-50 zoom-in-95 duration-100">
                                <Menu.Item
                                  onClick={() => togglePinSession(s.id)}
                                  className="w-full px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] flex items-center gap-2 cursor-pointer outline-none border-none bg-transparent"
                                >
                                  <Pin className={`h-3.5 w-3.5 text-[var(--muted-foreground)] ${s.isPinned ? 'fill-current text-[var(--primary)]' : ''}`} />
                                  <span>{s.isPinned ? 'Unpin' : 'Pin'}</span>
                                </Menu.Item>
                                
                                <Menu.Item
                                  onClick={() => {
                                    setEditingSessionId(s.id);
                                    setEditingTitle(s.title);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] flex items-center gap-2 cursor-pointer outline-none border-none bg-transparent"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                  <span>Rename</span>
                                </Menu.Item>

                                <Menu.Item
                                  onClick={() => {
                                    if (confirm('Permanently delete this chat session?')) {
                                      deleteSession(s.id);
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer outline-none border-none bg-transparent"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                  <span>Delete</span>
                                </Menu.Item>
                              </Menu.Popup>
                            </Menu.Positioner>
                          </Menu.Portal>
                        </Menu.Root>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] text-xs text-[var(--muted-foreground)] shrink-0">
            <div className="flex items-center gap-1.5 ml-1">
              {user && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => setCurrentSessionId(null)}
                        className="p-1 -ml-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] rounded transition-colors border-none bg-transparent cursor-pointer font-bold text-xs"
                      >
                        ←
                      </button>
                    }
                  />
                  <TooltipContent side="right" className="text-xs">
                    Back to History
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="font-semibold text-[var(--foreground)]">AI Strategist</div>
            </div>

            <div className="flex items-center gap-1.5">
              {deepResearchReport && (
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="ui-btn ui-btn-outline ui-btn-xs text-[var(--primary)] border-[var(--primary)]/30 text-[10px]"
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span>View Report</span>
                </button>
              )}

              {messages.length > 0 && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={downloadConversation}
                        className="ui-btn ui-btn-outline ui-btn-xs text-[10px]"
                      >
                        <Download className="w-3 h-3 text-[var(--primary)] shrink-0" />
                        <span>Download</span>
                      </button>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    Download entire conversation history as Markdown
                  </TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={startNewChat}
                      className="ui-btn ui-btn-outline ui-btn-xs text-[10px]"
                    >
                      <Plus className="w-3 h-3 text-[var(--primary)] shrink-0" />
                      <span>New Chat</span>
                    </button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  Start new chat session
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" ref={scrollRef} onScroll={handleScroll}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[var(--muted-foreground)]">
                <MessageSquare className="w-8 h-8 text-[var(--muted-foreground)] opacity-20 mb-3" />
                <p className="text-xs max-w-[240px] leading-relaxed">
                  Start a conversation about content strategy, SEO, outlines, or data analysis.
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-4">
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
                    {msg.role === 'assistant' && (() => {
                      const { displayContent, suggestions: parsedSuggestions } = extractDynamicSuggestions(msg.content);
                      const finalSuggestions = msg.payload?.suggestions || parsedSuggestions || [];
                      
                      return (
                        <div className="flex justify-start w-full">
                          <div className="max-w-[95%] min-w-0 bg-[var(--background)] border border-[var(--border)] rounded-xl rounded-bl-sm p-2.5 shadow-sm">
                            {msg.payload?.status ? (
                              <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] px-1 py-1">
                                <Loader2 className="w-3 h-3 animate-spin text-[var(--primary)]" />
                                <span>{msg.payload.status}</span>
                              </div>
                            ) : (
                              <>
                                <div className="prose strategist-prose max-w-none text-[var(--foreground)] text-xs">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {displayContent}
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
                                        <span>Source ({msg.payload.sources.length})</span>
                                      </div>
                                      <span className="text-[9px] text-[var(--primary)] font-medium">
                                        {expandedSources[msg.id] ? 'Hide' : 'Show All'}
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
                                            className="ui-badge ui-badge-surface ui-badge-xs hover:bg-[var(--surface-4)] hover:text-[var(--primary)] transition-colors no-underline text-[10px]"
                                            title={src.title || src.url}
                                          >
                                            <span className="font-semibold max-w-[120px] truncate">
                                              {src.title || src.domain || 'Link'}
                                            </span>
                                          </a>
                                        ))}

                                      {!expandedSources[msg.id] && msg.payload.sources.length > 3 && (
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
                                          onClick={() => handleCopy(displayContent, msg.id)}
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
                                            const clean = msg.content.replace(/\[SUGGESTIONS:[\s\S]*?\]/g, '');
                                            const blob = new Blob([clean], { type: 'text/markdown;charset=utf-8;' });
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
            )}
          </div>

          <div className="px-3 py-2 border-t border-[var(--border)] shrink-0">
            {uploadedAttachment && (
              <div className="ui-badge ui-badge-surface flex items-center gap-1.5 text-[10px] text-[var(--foreground)] w-fit mb-2 animate-fade-in py-1">
                <FileText className="w-3 h-3 text-[var(--primary)] shrink-0" />
                <span className="truncate max-w-[150px] font-medium">{uploadedAttachment.filename}</span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => setUploadedAttachment(null)}
                        className="p-0.5 rounded hover:bg-[var(--surface-4)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer ml-1"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    Remove attachment
                  </TooltipContent>
                </Tooltip>
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
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="ui-btn ui-btn-surface ui-btn-icon rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-transparent shrink-0"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                        </button>
                      }
                    />
                    <TooltipContent side="top" className="text-xs">
                      Attach file (PDF, CSV, TXT)
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => setEnableSearch(!enableSearch)}
                          className={`ui-btn ui-btn-icon rounded-full transition-colors cursor-pointer shrink-0 ${enableSearch
                              ? 'ui-btn-primary'
                              : 'ui-btn-outline text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-transparent'
                            }`}
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </button>
                      }
                    />
                    <TooltipContent side="top" className="text-xs">
                      {enableSearch ? 'Disable Web Search' : 'Enable Web Search'}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex items-center gap-1.5">
                  <Select value={researchMode} onValueChange={(val) => { if (val) setResearchMode(val as 'fast' | 'deep'); }}>
                    <SelectTrigger
                      size="sm"
                      className="h-7 border border-[var(--border)] bg-transparent hover:bg-[var(--surface-3)] text-[var(--foreground)] hover:text-[var(--foreground)] text-[10px] font-semibold !rounded-full px-3 flex items-center gap-1 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[var(--border)] [&_svg]:max-md:hidden"
                    >
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent 
                      side="top"
                      sideOffset={8}
                      className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg p-1 min-w-[130px] z-50"
                    >
                      <SelectItem value="fast" className="text-[10px] cursor-pointer rounded py-1.5 pl-2 pr-8 hover:bg-[var(--surface-2)]">Fast Mode</SelectItem>
                      <SelectItem value="deep" className="text-[10px] cursor-pointer rounded py-1.5 pl-2 pr-8 hover:bg-[var(--surface-2)]">Deep Research</SelectItem>
                    </SelectContent>
                  </Select>

                  <button
                    onClick={isTyping ? onCancelChat : () => handleSend()}
                    disabled={!isTyping && !chatInput.trim() && !uploadedAttachment}
                    className={`ui-btn ui-btn-icon rounded-full cursor-pointer shrink-0 ${
                      isTyping
                        ? 'ui-btn-danger'
                        : 'ui-btn-primary disabled:opacity-30'
                    }`}
                    title={isTyping ? 'Cancel generation' : 'Send message'}
                  >
                    {isTyping ? (
                      <Square className="w-3 h-3 fill-current" />
                    ) : (
                      <ArrowUp className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] w-full max-w-2xl h-[80vh] rounded-xl flex flex-col shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-semibold text-sm text-[var(--foreground)]">Deep Research Report</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(deepResearchReport || '');
                          toast.success('Report copied to clipboard!');
                        }}
                        className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    Copy Report
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => setShowReportModal(false)}
                        className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    }
                  />
                  <TooltipContent side="bottom" className="text-xs">
                    Close
                  </TooltipContent>
                </Tooltip>
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

      {editingSessionId !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" onClick={() => setEditingSessionId(null)}>
          <div 
            className="bg-[var(--surface-1)] border border-[var(--border)] w-full max-w-sm rounded-xl flex flex-col shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="font-semibold text-sm text-[var(--foreground)]">Rename Chat Session</span>
              <button
                type="button"
                onClick={() => setEditingSessionId(null)}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-none bg-transparent cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-3">
              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Session Title
              </label>
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameSession(editingSessionId, editingTitle);
                    setEditingSessionId(null);
                  } else if (e.key === 'Escape') {
                    setEditingSessionId(null);
                  }
                }}
              />
            </div>
            
            <div className="flex items-center justify-end gap-2 px-4 py-3 bg-[var(--surface-2)] border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setEditingSessionId(null)}
                className="ui-btn ui-btn-outline ui-btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  renameSession(editingSessionId, editingTitle);
                  setEditingSessionId(null);
                }}
                className="ui-btn ui-btn-primary ui-btn-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}