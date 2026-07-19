import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Minimize2, Maximize2, Link2, Check, X, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
      className="not-prose flex overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-xl"
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
            <Button
              type="button"
              variant="accent"
              size="icon-xs"
              onClick={handleSave}
              aria-label="Save link"
              title="Save link"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            {editor.isActive('link') && (
              <Button
                type="button"
                variant="danger"
                size="icon-xs"
                onClick={handleUnlink}
                aria-label="Remove link"
                title="Remove link"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="muted"
              size="icon-xs"
              onClick={() => setShowLinkInput(false)}
              aria-label="Cancel"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex border-r border-[var(--border)]">
            <Button
              type="button"
              variant="muted"
              size="icon-lg"
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-label="Bold"
              aria-pressed={editor.isActive('bold')}
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="muted"
              size="icon-lg"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-label="Italic"
              aria-pressed={editor.isActive('italic')}
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="muted"
              size="icon-lg"
              onClick={() => {
                setLinkUrl(editor.getAttributes('link').href || '');
                setShowLinkInput(true);
              }}
              aria-label="Edit link"
              aria-pressed={editor.isActive('link')}
              title="Edit link"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex px-1 items-center">
            <span className="mx-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">AI</span>
            
            <Button
              type="button"
              variant="accent"
              size="lg"
              onClick={() => editor.commands.triggerAiAction('shorten')}
            >
              <Minimize2 className="h-4 w-4" /> Shorten
            </Button>
            <Button
              type="button"
              variant="accent"
              size="lg"
              onClick={() => editor.commands.triggerAiAction('expand')}
            >
              <Maximize2 className="h-4 w-4" /> Expand
            </Button>
          </div>
        </>
      )}
    </BubbleMenu>
  );
};
