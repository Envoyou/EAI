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
  ) => boolean
) {
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<number>>(new Set());
  const [failedSuggestions, setFailedSuggestions] = useState<Set<number>>(new Set());
  const [expandedFeedback, setExpandedFeedback] = useState<Set<number>>(new Set());
  const [isSEOExpanded, setIsSEOExpanded] = useState(false);
  const [activeSourceInput, setActiveSourceInput] = useState<number | null>(null);
  const [sourceText, setSourceText] = useState('');

  const toggleFeedback = (index: number) => {
    setExpandedFeedback((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApplyClick = (
    target: string,
    replacement: string,
    operation: 'replace' | 'insert_before' | 'insert_after' | 'manual',
    index: number
  ) => {
    if (onApplyFix) {
      const success = onApplyFix(target, replacement, operation, index);
      if (success) {
        setAppliedSuggestions((prev) => new Set(prev).add(index));
      } else {
        setFailedSuggestions((prev) => new Set(prev).add(index));
      }
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
    appliedSuggestions,
    failedSuggestions,
    expandedFeedback,
    isSEOExpanded,
    setIsSEOExpanded,
    activeSourceInput,
    setActiveSourceInput,
    sourceText,
    setSourceText,
    toggleFeedback,
    handleApplyClick,
    handleCopy,
    handleCopySEOPack,
  };
}
