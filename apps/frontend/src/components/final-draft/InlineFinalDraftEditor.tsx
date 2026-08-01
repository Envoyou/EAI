'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { Markdown } from 'tiptap-markdown';

interface InlineFinalDraftEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
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

  return <EditorContent editor={editor} />;
}
