import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const documentHistory = readComponent('../DocumentHistoryPanel.tsx');
const documentSearch = readComponent('../document-history/DocumentHistorySearch.tsx');
const userDirectory = readComponent('../UserDirectory.tsx');
const userTable = readComponent('../user-directory/components/UserTable.tsx');
const creditAdjustment = readComponent('../user-directory/components/CreditAdjustmentModal.tsx');
const strategist = readComponent('../StrategistTab.tsx');
const bubbleMenu = readComponent('../editor/BubbleMenuAI.tsx');
const cancellation = readComponent('../CancelSubscriptionButton.tsx');

describe('standard text-control migration contract', () => {
  it.each([
    ['Document History title edit', documentHistory, 1],
    ['Document History search input', documentSearch, 1],
    ['User Table', userTable, 1],
    ['Strategist session rename', strategist, 1],
    ['Bubble Menu link editing', bubbleMenu, 1],
  ])('uses canonical Input in %s', (_name, source, inputCount) => {
    expect(source).not.toMatch(/<input\b/);
    expect(source.match(/<Input\b/g)).toHaveLength(inputCount);
  });

  it('uses canonical invitation fields in User Directory', () => {
    expect(userDirectory).not.toMatch(/<input\b|<textarea\b/);
    expect(userDirectory.match(/<Input\b/g)).toHaveLength(1);
    expect(userDirectory.match(/<Textarea\b/g)).toHaveLength(1);
  });

  it('uses canonical fields in Credit Adjustment while preserving its submit form', () => {
    expect(creditAdjustment).not.toMatch(/<input\b|<textarea\b/);
    expect(creditAdjustment.match(/<Input\b/g)).toHaveLength(3);
    expect(creditAdjustment.match(/<Textarea\b/g)).toHaveLength(1);
    expect(creditAdjustment).toContain('<form onSubmit={onSubmit}');
  });

  it('uses canonical cancellation feedback and checkbox controls', () => {
    expect(cancellation).not.toMatch(/<input\b/);
    expect(cancellation).not.toMatch(/<textarea\b/);
    expect(cancellation.match(/<Textarea\b/g)).toHaveLength(1);
    expect(cancellation.match(/<Checkbox\b/g)).toHaveLength(1);
  });

  it('preserves keyboard-owned interactions', () => {
    expect(documentHistory).toContain("if (e.key === 'Enter') handleTitleEdit(item.id)");
    expect(documentHistory).toContain("if (e.key === 'Escape') setEditingId(null)");
    expect(strategist).toContain("if (e.key === 'Enter')");
    expect(bubbleMenu).toContain("if (e.key === 'Enter')");
    expect(bubbleMenu).toContain('className="not-prose');
  });
});
