import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Minimize2, Maximize2, Link2, Check, X, Trash2 } from 'lucide-react';

interface BubbleMenuAIProps {
  editor: Editor;
}

export const BubbleMenuAI = ({ editor }: BubbleMenuAIProps) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      setShowLinkInput(false);
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor]);

  if (!editor) return null;

  const handleSave = () => {
    if (linkUrl.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      let formattedUrl = linkUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl) && !/^mailto:/i.test(formattedUrl) && !/^tel:/i.test(formattedUrl) && !formattedUrl.startsWith('/') && !formattedUrl.startsWith('#')) {
        formattedUrl = `https://${formattedUrl}`;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: formattedUrl }).run();
    }
    setShowLinkInput(false);
  };

  const handleUnlink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setShowLinkInput(false);
  };

  return (
    <BubbleMenu 
      editor={editor} 
      className="flex overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl"
      shouldShow={({ from, to, view }) => {
        if (from === to) return false;

        const isEditorFocused = view.hasFocus();
        const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
        const isFocusInInput = activeElement?.tagName === 'INPUT' && activeElement.getAttribute('placeholder') === 'Paste or type link...';

        return isEditorFocused || isFocusInInput;
      }}
    >
      {showLinkInput ? (
        <div 
          className="flex items-center gap-1.5 px-2 py-1 bg-[var(--surface-1)]"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            resize: 'both',
            overflow: 'auto',
            width: '280px',
            height: '36px',
            minWidth: '200px',
            maxWidth: '500px',
            minHeight: '36px',
            maxHeight: '150px',
          }}
        >
          <Link2 className="h-3.5 w-3.5 text-[var(--muted-foreground)] ml-1" />
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                handleSave();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
              }
            }}
            placeholder="Paste or type link..."
            className="flex-1 min-w-0 bg-transparent text-xs text-[var(--foreground)] border-none outline-none focus:ring-0 focus:outline-none placeholder:text-[var(--muted-foreground)]"
            autoFocus
          />
          <div className="flex items-center gap-0.5 border-l border-[var(--border)] pl-1.5 shrink-0">
            <button
              onClick={handleSave}
              className="p-1 hover:bg-[var(--surface-2)] text-[var(--primary)] rounded transition"
              title="Save link"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            {editor.isActive('link') && (
              <button
                onClick={handleUnlink}
                className="p-1 hover:bg-red-500/10 text-red-500 rounded transition"
                title="Remove link"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowLinkInput(false)}
              className="p-1 hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] rounded transition"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <>
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
            <button
              onClick={() => {
                setLinkUrl(editor.getAttributes('link').href || '');
                setShowLinkInput(true);
              }}
              className={`flex h-9 w-9 items-center justify-center text-[var(--foreground)] hover:bg-[var(--surface-2)] ${
                editor.isActive('link') ? 'bg-[var(--surface-2)] text-[var(--primary)]' : ''
              }`}
            >
              <Link2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex px-1 items-center">
            <span className="mx-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">AI</span>
            
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
        </>
      )}
    </BubbleMenu>
  );
};
