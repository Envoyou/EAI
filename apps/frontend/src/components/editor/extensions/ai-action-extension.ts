import { Extension } from '@tiptap/core';
import { toast } from 'sonner';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ai: {
      triggerAiAction: (action: string) => ReturnType;
    };
  }
}

export const AiActionExtension = Extension.create({
  name: 'aiAction',

  addCommands() {
    return {
      triggerAiAction:
        (action: string) =>
        ({ editor, state }) => {
          const { from, to } = state.selection;
          
          let selectionMarkdown = '';
          if (from === to) {
            // Find current paragraph if no selection
            const $pos = state.doc.resolve(from);
            const start = $pos.start();
            const end = $pos.end();
            selectionMarkdown = state.doc.textBetween(start, end);
          } else {
            // Wait, there is no textBetween that outputs Markdown. We will just pass the plain text for now, or use `editor.storage.markdown.getMarkdown()` but that's whole doc.
            // Better to grab the text content
            selectionMarkdown = state.doc.textBetween(from, to, '\n');
          }

          if (!selectionMarkdown.trim()) {
            toast.error('Please select some text or place cursor in a paragraph first.');
            return false;
          }
          
          const contextMarkdown = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown().substring(0, 3000); // 3k char context

          toast.loading(`Running AI ${action}...`, { id: 'ai-action' });

          // Call API
          fetch('/api/editor/ai-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              selectionMarkdown,
              contextMarkdown,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.error) throw new Error(data.error);
              toast.success(`AI ${action} complete.`, { id: 'ai-action' });
              
              // Insert AI Preview Block
              editor.chain().focus().insertContent({
                type: 'aiPreview',
                attrs: {
                  action,
                  originalContent: selectionMarkdown,
                  content: data.content,
                },
              }).run();
            })
            .catch((err) => {
              toast.error(err.message || 'AI action failed', { id: 'ai-action' });
            });

          return true;
        },
    };
  },
});
