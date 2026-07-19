import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const notes = readSource('../NotesTab.tsx');
const cancellation = readSource('../CancelSubscriptionButton.tsx');
const identity = readSource('../../app/[locale]/settings/publication/identity/page.tsx');
const workflow = readSource('../../app/[locale]/settings/workflow/page.tsx');
const dashboard = readSource('../DashboardLayoutShell.tsx');
const chatInput = readSource('../strategist-tab/components/ChatInputBar.tsx');
const editor = readSource('../Editor.tsx');

describe('specialized form-control ownership', () => {
  it('uses canonical checkbox and switch primitives in feature code', () => {
    expect(notes).not.toMatch(/<input\b/);
    expect(notes.match(/<Checkbox\b/g)).toHaveLength(1);
    expect(cancellation).not.toMatch(/<input\b/);
    expect(cancellation.match(/<Checkbox\b/g)).toHaveLength(1);
    expect(identity).not.toMatch(/<input\b/);
    expect(identity.match(/<Checkbox\b/g)).toHaveLength(2);
    expect(workflow).not.toMatch(/<input\b/);
    expect(workflow.match(/<Switch\b/g)).toHaveLength(1);
  });

  it('uses canonical date inputs in both Dashboard layouts', () => {
    expect(dashboard).not.toMatch(/<input\b/);
    expect(dashboard.match(/<Input\b/g)).toHaveLength(4);
    expect(dashboard.match(/type="date"/g)).toHaveLength(4);
  });

  it('keeps Chat file and autosize ownership behind canonical components', () => {
    expect(chatInput).not.toMatch(/<input\b|<textarea\b/);
    expect(chatInput.match(/<FileInput\b/g)).toHaveLength(1);
    expect(chatInput.match(/<Textarea\b/g)).toHaveLength(1);
    expect(chatInput).toContain("el.style.height = 'auto'");
    expect(chatInput).toContain("e.key === 'Enter' && !e.shiftKey");
  });

  it('documents the raw Markdown canvas as the sole feature-level exemption', () => {
    expect(editor.match(/<textarea\b/g)).toHaveLength(1);
    expect(editor).toContain('{/* Raw Markdown Editor */}');
  });
});
