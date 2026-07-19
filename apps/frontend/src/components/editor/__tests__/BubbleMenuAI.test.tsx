import { readFileSync } from 'node:fs';
import type { PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';

import { BubbleMenuAI } from '../BubbleMenuAI';

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: ({ children, className }: PropsWithChildren<{ className?: string }>) => (
    <div className={className} data-bubble-menu="true">
      {children}
    </div>
  ),
}));

function createEditor() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    isActive: vi.fn((name: string) => name === 'bold'),
    chain: vi.fn(),
    getAttributes: vi.fn(() => ({ href: '' })),
    commands: { triggerAiAction: vi.fn() },
  } as unknown as Editor;
}

describe('BubbleMenuAI UI contract', () => {
  it('keeps toolbar controls outside prose styling and exposes their toggle state', () => {
    const markup = renderToStaticMarkup(<BubbleMenuAI editor={createEditor()} />);

    expect(markup).toContain('data-bubble-menu="true"');
    expect(markup).toContain('not-prose');
    expect(markup).toContain('aria-label="Bold"');
    expect(markup).toContain('aria-label="Italic"');
    expect(markup).toContain('aria-label="Edit link"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('Shorten');
    expect(markup).toContain('Expand');
  });

  it('uses the canonical Button API for every action', () => {
    const source = readFileSync(new URL('../BubbleMenuAI.tsx', import.meta.url), 'utf8');

    expect(source).not.toMatch(/<button\b/);
    expect(source.match(/<Button\b/g)).toHaveLength(8);
  });
});
