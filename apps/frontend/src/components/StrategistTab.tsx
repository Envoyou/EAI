'use client';

import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Download,
  Plus,
  X,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { StrategistTabProps } from './strategist-tab/types';
import { useStrategistChat } from './strategist-tab/hooks/useStrategistChat';
import { SessionSidebar } from './strategist-tab/components/SessionSidebar';
import {
  ChatMessageList,
  ChatPositionIndicator,
  TranscriptOutline,
} from './strategist-tab/components/ChatMessageList';
import { ChatInputBar } from './strategist-tab/components/ChatInputBar';
import { MessageScrollerProvider } from '@/components/ui/message-scroller';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { QuickDraftDialog } from './strategist-tab/components/QuickDraftDialog';
import { AddDocumentActionIcon } from '@/components/ui/icons/actions';

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
  quickDraftMode,
  openQuickDraft,
  setQuickDraftMode,
  closeQuickDraft,
  quickDraftTopic,
  setQuickDraftTopic,
  quickDraftOutline,
  setQuickDraftOutline,
  quickDraftReference,
  setQuickDraftReference,
  quickDraftOutput,
  quickDraftError,
  isGeneratingQuickDraft,
  submitQuickDraft,
}: StrategistTabProps) {
  const { user } = useUser();
  const tQuickDraft = useTranslations('QuickDraft');
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
    <div className="flex flex-col h-full border border bg-[var(--surface-1)]">
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
                      <Button
                        type="button"
                        onClick={() => setCurrentSessionId(null)}
                        variant="muted"
                        size="icon-xs"
                        className="strategist-panel-icon-action -ml-1 rounded font-bold text-xs"
                        aria-label="Back to History"
                      >
                        ←
                      </Button>
                    }
                  />
                  <TooltipContent side="right" className="text-xs">
                    Back to History
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="strategist-toolbar-title font-semibold text-[var(--foreground)]">
                AI Strategist
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      onClick={() => openQuickDraft('topic')}
                      variant="outline"
                      size="xs"
                      disabled={isTyping}
                      aria-label={tQuickDraft('title')}
                    >
                      <AddDocumentActionIcon className="w-3 h-3 text-[var(--primary)] shrink-0" />
                      <span className="strategist-toolbar-label">{tQuickDraft('title')}</span>
                    </Button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {tQuickDraft('description')}
                </TooltipContent>
              </Tooltip>

              {/* Reader position indicator — visible when scrolled away from latest */}
              <ChatPositionIndicator />

              {/* Transcript Outline — interactive turn navigator */}
              <TranscriptOutline messages={messages} />

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
                        aria-label="Download conversation"
                      >
                        <Download className="w-3 h-3 text-[var(--primary)] shrink-0" />
                        <span className="strategist-toolbar-label">Download</span>
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
                      aria-label="Start new chat"
                    >
                      <Plus className="w-3 h-3 text-[var(--primary)] shrink-0" />
                      <span className="strategist-toolbar-label">New Chat</span>
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

      <QuickDraftDialog
        mode={quickDraftMode}
        onModeChange={setQuickDraftMode}
        onClose={closeQuickDraft}
        topic={quickDraftTopic}
        onTopicChange={setQuickDraftTopic}
        outline={quickDraftOutline}
        onOutlineChange={setQuickDraftOutline}
        reference={quickDraftReference}
        onReferenceChange={setQuickDraftReference}
        output={quickDraftOutput}
        error={quickDraftError}
        generating={isGeneratingQuickDraft}
        onSubmit={submitQuickDraft}
      />
    </div>
  );
}
