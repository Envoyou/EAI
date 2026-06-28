import React from 'react';
import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Wand2, Minimize2, Maximize2 } from 'lucide-react';

interface BubbleMenuAIProps {
  editor: Editor;
}

export const BubbleMenuAI = ({ editor }: BubbleMenuAIProps) => {
  if (!editor) return null;

  return (
    <BubbleMenu editor={editor} className="flex overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl">
      <div className="flex border-r border-[var(--border)]">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`flex h-9 w-9 items-center justify-center text-[var(--foreground)] hover:bg-[var(--surface-2)] ${
            editor.isActive('bold') ? 'bg-[var(--surface-2)] text-[var(--primary)]' : ''
          }`}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`flex h-9 w-9 items-center justify-center text-[var(--foreground)] hover:bg-[var(--surface-2)] ${
            editor.isActive('italic') ? 'bg-[var(--surface-2)] text-[var(--primary)]' : ''
          }`}
        >
          <Italic className="h-4 w-4" />
        </button>
      </div>

      <div className="flex px-1 items-center">
        <span className="mx-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">AI</span>
        
        <button
          onClick={() => editor.commands.triggerAiAction('rewrite')}
          className="flex h-9 items-center gap-1.5 px-3 text-sm text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-md transition-colors"
        >
          <Wand2 className="h-4 w-4" /> Rewrite
        </button>
        <button
          onClick={() => editor.commands.triggerAiAction('shorten')}
          className="flex h-9 items-center gap-1.5 px-3 text-sm text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-md transition-colors"
        >
          <Minimize2 className="h-4 w-4" /> Shorten
        </button>
        <button
          onClick={() => editor.commands.triggerAiAction('expand')}
          className="flex h-9 items-center gap-1.5 px-3 text-sm text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-md transition-colors"
        >
          <Maximize2 className="h-4 w-4" /> Expand
        </button>
      </div>
    </BubbleMenu>
  );
};
