import { describe, expect, it } from 'vitest';
import {
  getCurrentArticleHistoryItems,
  getHistoryItemPresentation,
  type HistoryItem,
} from '@/components/document-history-utils';

const baseItem: HistoryItem = {
  id: 'history_1',
  createdAt: '2026-08-01T10:00:00.000Z',
  role: 'editor',
  verdict: 'ready',
  isPinned: false,
};

describe('getHistoryItemPresentation', () => {
  it('prefers the saved article title over generic taxonomy labels', () => {
    const result = getHistoryItemPresentation({
      ...baseItem,
      metadata: {
        type: 'News Analysis',
        category: 'Technology & AI',
        workingTitle: 'Working title',
        generatedMetadata: { title: 'Final publication title' },
      },
    });

    expect(result.title).toBe('Final publication title');
    expect(result.title).not.toBe('News Analysis · Technology & AI');
  });

  it('explains which durable article assets are present', () => {
    const result = getHistoryItemPresentation({
      ...baseItem,
      metadata: {
        generatedMetadata: { title: 'Final publication title' },
        researchNotes: [{ id: 'note_1' }, { id: 'note_2' }],
        attachments: [{ id: 'attachment_1' }],
        exportStatus: { lastExportStatus: 'success' },
        _system: { polishedDraft: 'One two three four' },
      },
    });

    expect(result).toMatchObject({
      stage: 'ready',
      hasFinalDraft: true,
      hasPublicationMetadata: true,
      noteCount: 2,
      attachmentCount: 1,
      wordCount: 4,
      wasExported: true,
    });
  });

  it('keeps only the latest snapshot in an article family', () => {
    const current = getCurrentArticleHistoryItems([
      {
        ...baseItem,
        id: 'revision_old',
        verdict: 'blocked',
        metadata: { sourceRef: 'article_family_1' },
      },
      {
        ...baseItem,
        id: 'revision_current',
        createdAt: '2026-08-02T10:00:00.000Z',
        verdict: 'ready',
        metadata: { sourceRef: 'article_family_1' },
      },
    ]);

    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe('revision_current');
    expect(current[0]?.verdict).toBe('ready');
  });

  it('counts only findings unresolved on the current snapshot', () => {
    const result = getHistoryItemPresentation({
      ...baseItem,
      verdict: 'blocked',
      feedback: [
        { status: 'warning' },
        { status: 'fail' },
        { status: 'warning', isAccepted: true },
        { status: 'fail', isApplied: true },
        { status: 'pass' },
      ],
    });

    expect(result.unresolvedFindingCount).toBe(2);
    expect(result.blockingFindingCount).toBe(1);
    expect(result.hasFindingSnapshot).toBe(true);
    expect(result.stage).toBe('blocked');
  });

  it('does not present a contradictory ready verdict as publication-ready', () => {
    const result = getHistoryItemPresentation({
      ...baseItem,
      verdict: 'ready',
      feedback: [{ status: 'warning' }],
    });

    expect(result.stage).toBe('review');
    expect(result.unresolvedFindingCount).toBe(1);
  });

  it('distinguishes a legacy response that omits the finding snapshot', () => {
    const result = getHistoryItemPresentation(baseItem);

    expect(result.hasFindingSnapshot).toBe(false);
    expect(result.unresolvedFindingCount).toBe(0);
  });
});
