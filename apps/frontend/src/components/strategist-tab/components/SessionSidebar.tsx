'use client';

import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { ChatSession } from '@/lib/hooks/useContentStrategist';
import {
  Plus,
  MessageSquare,
  Pin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { AdaptiveActionMenu } from '@/components/ui/adaptive-action-menu';
import {
  DeleteActionIcon,
  EditActionIcon,
  MoreActionsIcon,
  PinActionIcon,
} from '@/components/ui/icons/actions';

interface SessionSidebarProps {
  sessions: ChatSession[];
  isSessionsLoading: boolean;
  startNewChat: () => void;
  selectSession: (id: string) => Promise<void>;
  togglePinSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  onStartRename: (id: string, title: string) => void;
}

export function SessionSidebar({
  sessions,
  isSessionsLoading,
  startNewChat,
  selectSession,
  togglePinSession,
  deleteSession,
  onStartRename,
}: SessionSidebarProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="font-bold text-xs text-[var(--foreground)]">
          EAI Research History
        </div>
        <Button
          type="button"
          onClick={startNewChat}
          variant="primary"
          size="xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          <span>New Chat</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {isSessionsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]">
            <EAILoaderStatusIcon className="w-5 h-5 text-[var(--primary)] mb-2" />
            <span className="text-[10px]">Loading history...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 border border-dashed border-[var(--border)] rounded-xl bg-[var(--surface-2)] text-center my-4 mx-2">
            <MessageSquare className="w-8 h-8 text-[var(--muted-foreground)] opacity-40 mb-2.5" />
            <h3 className="text-xs font-semibold text-[var(--foreground)] mb-1">
              Start New Chat
            </h3>
            <p className="text-[10px] text-[var(--muted-foreground)] max-w-[200px] mb-3">
              Ask the AI Strategist for content ideas, SEO outlines, or draft
              previews.
            </p>
            <Button
              type="button"
              onClick={startNewChat}
              variant="primary"
              size="xs"
            >
              <span>Start Chat</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="group relative flex items-center gap-2 px-2.5 py-1 rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-3)]/60 transition-all cursor-pointer"
                onClick={() => selectSession(s.id)}
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
                      day: 'numeric',
                    })}
                  </span>
                </div>

                <div
                  className="shrink-0 flex items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AdaptiveActionMenu
                    title={`Actions for ${s.title}`}
                    trigger={
                      <ActionButton
                        type="button"
                        variant="muted"
                        size="icon-xs"
                        className="strategist-session-menu-trigger opacity-100 md:opacity-0 md:group-hover:opacity-100 data-[popup-open]:opacity-100"
                        aria-label={`Actions for ${s.title}`}
                        icon={MoreActionsIcon}
                        label={`Actions for ${s.title}`}
                        labelClassName="sr-only"
                      />
                    }
                    items={[
                      {
                        key: 'pin',
                        label: s.isPinned ? 'Unpin' : 'Pin',
                        icon: PinActionIcon,
                        onSelect: () => togglePinSession(s.id),
                      },
                      {
                        key: 'rename',
                        label: 'Rename',
                        icon: EditActionIcon,
                        onSelect: () => onStartRename(s.id, s.title),
                      },
                      {
                        key: 'delete',
                        label: 'Delete',
                        icon: DeleteActionIcon,
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => {
                          if (confirm('Permanently delete this chat session?')) {
                            return deleteSession(s.id);
                          }
                        },
                      },
                    ]}
                    contentClassName="w-40"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
