import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, X, Sparkles } from 'lucide-react';

export const AIPreviewBlockComponent = ({ node, editor }: NodeViewProps) => {
  const { content, originalContent, action } = node.attrs;

  const handleAccept = () => {
    editor.chain().focus().deleteNode('aiPreview').insertContent(content).run();
  };

  const handleReject = () => {
    editor.chain().focus().deleteNode('aiPreview').insertContent(originalContent).run();
  };

  return (
    <NodeViewWrapper className="my-6 overflow-hidden rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5 shadow-md">
      <div className="flex items-center justify-between border-b border-[var(--primary)]/20 bg-[var(--primary)]/10 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
          <Sparkles className="h-4 w-4" />
          <span className="capitalize">{action.replace('_', ' ')} Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReject}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            <X className="h-3 w-3" /> Reject
          </button>
          <button
            onClick={handleAccept}
            className="flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-[var(--primary)]/90"
          >
            <Check className="h-3 w-3" /> Accept
          </button>
        </div>
      </div>
      <div className="p-4 prose prose-sm dark:prose-invert max-w-none text-[var(--foreground)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </NodeViewWrapper>
  );
};
