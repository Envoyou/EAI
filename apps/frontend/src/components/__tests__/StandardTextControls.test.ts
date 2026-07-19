import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readComponent = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const documentHistory = readComponent('../DocumentHistoryPanel.tsx');
const historySidebar = readComponent('../HistorySidebar.tsx');
const userDirectory = readComponent('../UserDirectory.tsx');
const userTable = readComponent('../user-directory/components/UserTable.tsx');
const creditAdjustment = readComponent('../user-directory/components/CreditAdjustmentModal.tsx');
const strategist = readComponent('../StrategistTab.tsx');
const bubbleMenu = readComponent('../editor/BubbleMenuAI.tsx');
const cancellation = readComponent('../CancelSubscriptionButton.tsx');

describe('standard text-control migration contract', () => {
  it.each([
    ['Document History', documentHistory, 2],
    ['History Sidebar', historySidebar, 2],
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

  it('migrates cancellation feedback but retains its specialized checkboxes', () => {
    expect(cancellation).not.toMatch(/<textarea\b/);
    expect(cancellation.match(/<Textarea\b/g)).toHaveLength(1);
    expect(cancellation).toMatch(/<input\b[\s\S]*?type="checkbox"/);
  });

  it('preserves keyboard-owned interactions', () => {
    expect(documentHistory).toContain("if (e.key === 'Enter') handleTitleEdit(item.id)");
    expect(historySidebar).toContain("if (e.key === 'Escape') setEditingId(null)");
    expect(strategist).toContain("if (e.key === 'Enter')");
    expect(bubbleMenu).toContain("if (e.key === 'Enter')");
    expect(bubbleMenu).toContain('className="not-prose');
  });
});
