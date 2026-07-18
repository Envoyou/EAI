'use client';

import { useRef, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import {
  FileText,
  Download,
  Plus,
  Copy,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { StrategistTabProps } from './strategist-tab/types';
import { useStrategistChat } from './strategist-tab/hooks/useStrategistChat';
import { SessionSidebar } from './strategist-tab/components/SessionSidebar';
import { ChatMessageList } from './strategist-tab/components/ChatMessageList';
import { ChatInputBar } from './strategist-tab/components/ChatInputBar';

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
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const prevIsTypingRef = useRef(isTyping);

  const {
    fileInputRef,
    editingSessionId,
    setEditingSessionId,
    editingTitle,
    setEditingTitle,
    triggerFileSelect,
    handleFileChange,
    handleStartRename,
    handleSaveRename,
  } = useStrategistChat(handleFileUpload, renameSession);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setShouldAutoScroll(isAtBottom);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prevIsTyping = prevIsTypingRef.current;
    if (isTyping && !prevIsTyping) {
      el.scrollTop = el.scrollHeight;
      setTimeout(() => setShouldAutoScroll(true), 0);
    } else if (shouldAutoScroll) {
      el.scrollTop = el.scrollHeight;
    }
    prevIsTypingRef.current = isTyping;
  }, [messages, isTyping, shouldAutoScroll]);

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
    const blob = new Blob([conversationMarkdown], {
      type: 'text/markdown;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `eai-strategist-chat-${new Date().toISOString().slice(0, 10)}.md`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Conversation downloaded successfully.');
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-1)]">
      {currentSessionId === null ? (
        <SessionSidebar
          sessions={sessions}
          isSessionsLoading={isSessionsLoading}
          startNewChat={startNewChat}
          selectSession={selectSession}
          togglePinSession={togglePinSession}
          deleteSession={deleteSession}
          onStartRename={handleStartRename}
        />
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
              <div className="font-semibold text-[var(--foreground)]">
                AI Strategist
              </div>
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

          <div
            className="flex-1 overflow-y-auto overflow-x-hidden"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            <ChatMessageList
              messages={messages}
              isTyping={isTyping}
              copiedMessageId={copiedMessageId}
              handleSend={handleSend}
              handleRewrite={handleRewrite}
              handleCopy={handleCopy}
              saveNote={saveNote}
            />
          </div>

          <ChatInputBar
            chatInput={chatInput}
            setChatInput={setChatInput}
            isTyping={isTyping}
            uploadedAttachment={uploadedAttachment}
            setUploadedAttachment={setUploadedAttachment}
            enableSearch={enableSearch}
            setEnableSearch={setEnableSearch}
            researchMode={researchMode}
            setResearchMode={setResearchMode}
            handleSend={handleSend}
            onCancelChat={onCancelChat}
            triggerFileSelect={triggerFileSelect}
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
          />
        </>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] w-full max-w-2xl h-[80vh] rounded-xl flex flex-col shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--primary)]" />
                <span className="font-semibold text-sm text-[var(--foreground)]">
                  Deep Research Report
                </span>
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
            <div className="flex-1 overflow-y-auto p-4 text-xs leading-relaxed text-[var(--foreground)] strategist-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {deepResearchReport || ''}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {editingSessionId !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setEditingSessionId(null)}
        >
          <div
            className="bg-[var(--surface-1)] border border-[var(--border)] w-full max-w-sm rounded-xl flex flex-col shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="font-semibold text-sm text-[var(--foreground)]">
                Rename Chat Session
              </span>
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
                    handleSaveRename(editingSessionId);
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
                onClick={() => handleSaveRename(editingSessionId)}
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