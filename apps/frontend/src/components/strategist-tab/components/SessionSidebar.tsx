'use client';

import { ChatSession } from '@/lib/hooks/useContentStrategist';
import {
  Plus,
  Loader2,
  MessageSquare,
  Pin,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Menu } from '@base-ui/react/menu';

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
            <h3 className="text-xs font-semibold text-[var(--foreground)] mb-1">
              Start New Chat
            </h3>
            <p className="text-[10px] text-[var(--muted-foreground)] max-w-[200px] mb-3">
              Ask the AI Strategist for content ideas, SEO outlines, or draft
              previews.
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
            {sessions.map((s) => (
              <div
                key={s.id}
                className="group relative flex items-center gap-2 py-1.5 px-2.5 rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-3)]/60 transition-all cursor-pointer"
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
                            <Pin
                              className={`h-3.5 w-3.5 text-[var(--muted-foreground)] ${
                                s.isPinned
                                  ? 'fill-current text-[var(--primary)]'
                                  : ''
                              }`}
                            />
                            <span>{s.isPinned ? 'Unpin' : 'Pin'}</span>
                          </Menu.Item>

                          <Menu.Item
                            onClick={() => onStartRename(s.id, s.title)}
                            className="w-full px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] flex items-center gap-2 cursor-pointer outline-none border-none bg-transparent"
                          >
                            <Pencil className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                            <span>Rename</span>
                          </Menu.Item>

                          <Menu.Item
                            onClick={() => {
                              if (
                                confirm('Permanently delete this chat session?')
                              ) {
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
