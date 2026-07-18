import { useState } from 'react';
import { toast } from 'sonner';
import { AnalysisResult } from '@eai/shared';

export function useFeedbackActions(
  result: AnalysisResult,
  onApplyFix?: (
    targetText: string,
    replacementText: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number
  ) => Promise<boolean>
) {
  const [expandedFeedback, setExpandedFeedback] = useState<Set<string>>(new Set());
  const [isSEOExpanded, setIsSEOExpanded] = useState(false);
  const [activeSourceInput, setActiveSourceInput] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [applyingFeedback, setApplyingFeedback] = useState<string | null>(null);
  const [submittingSource, setSubmittingSource] = useState<string | null>(null);

  const toggleFeedback = (feedbackKey: string) => {
    setExpandedFeedback((prev) => {
      const next = new Set(prev);
      if (next.has(feedbackKey)) {
        next.delete(feedbackKey);
      } else {
        next.add(feedbackKey);
      }
      return next;
    });
  };

  const handleApplyClick = async (
    target: string,
    replacement: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number,
    feedbackKey: string
  ): Promise<void> => {
    if (!onApplyFix || applyingFeedback !== null) return;
    setApplyingFeedback(feedbackKey);
    try {
      await onApplyFix(target, replacement, operation, index);
    } finally {
      setApplyingFeedback(null);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied!`);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleCopySEOPack = async () => {
    if (!result.generatedMetadata) return;
    const {
      title: t,
      slug,
      metaTitle,
      excerpt,
      metaDescription,
      coverImageAltText,
      tags,
    } = result.generatedMetadata;
    const pack = [
      t ? `Title: ${t}` : '',
      slug ? `Slug: ${slug}` : '',
      metaTitle ? `Meta Title: ${metaTitle}` : '',
      excerpt ? `Excerpt: ${excerpt}` : '',
      metaDescription ? `Meta Description: ${metaDescription}` : '',
      coverImageAltText ? `Cover Image Alt: ${coverImageAltText}` : '',
      tags?.length ? `Tags: ${tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(pack);
      toast.success('SEO Pack copied!');
    } catch {
      toast.error('Failed to copy SEO Pack');
    }
  };

  return {
    expandedFeedback,
    isSEOExpanded,
    setIsSEOExpanded,
    activeSourceInput,
    setActiveSourceInput,
    sourceText,
    setSourceText,
    applyingFeedback,
    submittingSource,
    setSubmittingSource,
    toggleFeedback,
    handleApplyClick,
    handleCopy,
    handleCopySEOPack,
  };
}
