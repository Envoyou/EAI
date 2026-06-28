import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AIPreviewBlockComponent } from './AIPreviewBlockComponent';

export const AIPreviewExtension = Node.create({
  name: 'aiPreview',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      content: {
        default: '',
      },
      originalContent: {
        default: '',
      },
      action: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'ai-preview',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ai-preview', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AIPreviewBlockComponent);
  },
});
