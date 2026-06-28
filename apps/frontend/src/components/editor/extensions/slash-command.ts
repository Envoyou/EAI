import { Extension, Editor, Range } from '@tiptap/core';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { CommandList } from './CommandList';
import { LucideIcon, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Wand2, Search, Minimize2, Maximize2 } from 'lucide-react';

export interface CommandItem {
  title: string;
  description: string;
  icon: LucideIcon;
  command: (props: { editor: Editor; range: Range }) => void;
}

export const getSuggestionItems = ({ query }: { query: string }): CommandItem[] => {
  return [
    {
      title: 'Heading 1',
      description: 'Big section heading.',
      icon: Heading1,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
      },
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading.',
      icon: Heading2,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
      },
    },
    {
      title: 'Heading 3',
      description: 'Small section heading.',
      icon: Heading3,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
      },
    },
    {
      title: 'Bullet List',
      description: 'Create a simple bulleted list.',
      icon: List,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: 'Numbered List',
      description: 'Create a list with numbering.',
      icon: ListOrdered,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: 'Quote',
      description: 'Capture a quote.',
      icon: Quote,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    // AI Commands
    {
      title: 'Rewrite (AI)',
      description: 'Rewrite the previous paragraph.',
      icon: Wand2,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).run();
        editor.commands.triggerAiAction('rewrite');
      },
    },
    {
      title: 'Expand (AI)',
      description: 'Expand the previous paragraph.',
      icon: Maximize2,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).run();
        editor.commands.triggerAiAction('expand');
      },
    },
    {
      title: 'Shorten (AI)',
      description: 'Shorten the previous paragraph.',
      icon: Minimize2,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).run();
        editor.commands.triggerAiAction('shorten');
      },
    },
    {
      title: 'SEO Optimize (AI)',
      description: 'Optimize previous paragraph for SEO.',
      icon: Search,
      command: ({ editor, range }: { editor: Editor; range: Range }) => {
        editor.chain().focus().deleteRange(range).run();
        editor.commands.triggerAiAction('seo_optimize');
      },
    },
  ].filter(item => item.title.toLowerCase().includes(query.toLowerCase()));
};

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: CommandItem }) => {
          props.command({ editor, range });
        },
      } as Omit<SuggestionOptions, 'editor'>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export const renderItems = () => {
  let component: ReactRenderer | null = null;
  let popup: TippyInstance[] | null = null;

  return {
    onStart: (props: Record<string, unknown> & { editor: Editor; clientRect?: () => DOMRect }) => {
      component = new ReactRenderer(CommandList, {
        props,
        editor: props.editor,
      });

      if (!props.clientRect) {
        return;
      }

      popup = tippy('body', {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      });
    },

    onUpdate(props: Record<string, unknown> & { clientRect?: () => DOMRect }) {
      component?.updateProps(props);

      if (!props.clientRect) {
        return;
      }

      popup?.[0]?.setProps({
        getReferenceClientRect: props.clientRect,
      });
    },

    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === 'Escape') {
        popup?.[0]?.hide();
        return true;
      }
      return (component?.ref as { onKeyDown: (p: { event: KeyboardEvent }) => boolean })?.onKeyDown(props);
    },

    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
    },
  };
};
