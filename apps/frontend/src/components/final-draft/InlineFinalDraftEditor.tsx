'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { Markdown } from 'tiptap-markdown';
import { findEditorFocusRange } from './editor-focus';

interface InlineFinalDraftEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  focusText?: string;
}

type MarkdownStorage = {
  markdown?: {
    getMarkdown: () => string;
  };
};

const readMarkdown = (storage: unknown): string =>
  (storage as MarkdownStorage).markdown?.getMarkdown() ?? '';

export function InlineFinalDraftEditor({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  focusText,
}: InlineFinalDraftEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
        },
      }),
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: true,
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'final-draft-inline-editor prose prose-sm max-w-none dark:prose-invert',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(readMarkdown(currentEditor.storage));
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const currentMarkdown = readMarkdown(editor.storage);
    if (currentMarkdown !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor || disabled || !focusText?.trim()) return;

    let selection: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, position) => {
      if (selection || !node.isTextblock) return !selection;
      const range = findEditorFocusRange(node.textContent, focusText);
      if (!range) return true;
      selection = {
        from: position + 1 + range.from,
        to: position + 1 + range.to,
      };
      return false;
    });

    if (!selection) return;
    const targetSelection = selection;
    requestAnimationFrame(() => {
      editor
        .chain()
        .focus()
        .setTextSelection(targetSelection)
        .scrollIntoView()
        .run();
    });
  }, [disabled, editor, focusText]);

  return <EditorContent editor={editor} />;
}
