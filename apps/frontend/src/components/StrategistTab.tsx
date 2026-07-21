'use client';

import { useState } from 'react';
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
import { ChatMessageList, ChatPositionIndicator } from './strategist-tab/components/ChatMessageList';
import { ChatInputBar } from './strategist-tab/components/ChatInputBar';
import { MessageScrollerProvider } from '@/components/ui/message-scroller';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
  const [showReportModal, setShowReportModal] = useState(false);

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
        <MessageScrollerProvider autoScroll>
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
                <Button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  variant="outline"
                  size="xs"
                  className="text-[var(--primary)] border-[var(--primary)]/30 text-[10px]"
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span>View Report</span>
                </Button>
              )}

              {/* Reader position indicator — visible when scrolled away from latest */}
              <ChatPositionIndicator />

              {messages.length > 0 && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        onClick={downloadConversation}
                        variant="outline"
                        size="xs"
                        className="text-[10px]"
                      >
                        <Download className="w-3 h-3 text-[var(--primary)] shrink-0" />
                        <span>Download</span>
                      </Button>
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
                    <Button
                      type="button"
                      onClick={startNewChat}
                      variant="outline"
                      size="xs"
                      className="text-[10px]"
                    >
                      <Plus className="w-3 h-3 text-[var(--primary)] shrink-0" />
                      <span>New Chat</span>
                    </Button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  Start new chat session
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <ChatMessageList
              messages={messages}
              isTyping={isTyping}
              copiedMessageId={copiedMessageId}
              handleSend={handleSend}
              handleRewrite={handleRewrite}
              handleCopy={handleCopy}
              saveNote={saveNote}
            />

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
        </MessageScrollerProvider>
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
              <Button
                type="button"
                onClick={() => setEditingSessionId(null)}
                variant="muted"
                size="icon-xs"
                className="rounded text-[var(--muted-foreground)] border-none bg-transparent"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-3">
              <label className="block text-xs font-medium text-[var(--muted-foreground)]">
                Session Title
              </label>
              <Input
                variant="surface"
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="text-xs"
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
              <Button
                type="button"
                onClick={() => setEditingSessionId(null)}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => handleSaveRename(editingSessionId)}
                variant="primary"
                size="sm"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
