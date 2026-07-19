import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NodeViewProps } from '@tiptap/react';

import { AIPreviewBlockComponent } from '../AIPreviewBlockComponent';

vi.mock('@tiptap/react', async () => {
  const React = await import('react');

  return {
    NodeViewWrapper: ({
      children,
      className,
    }: React.PropsWithChildren<{ className?: string }>) =>
      React.createElement(
        'div',
        { className, 'data-node-view-wrapper': 'true' },
        children
      ),
  };
});

function renderPreview() {
  const props = {
    node: {
      attrs: {
        action: 'shorten',
        content: [
          '# Preview heading',
          '',
          '[Source](https://example.com)',
          '',
          '| Claim | Status |',
          '| --- | --- |',
          '| Example | Verified |',
          '',
          '`inline code`',
        ].join('\n'),
        originalContent: 'Original content',
      },
    },
    editor: {},
  } as NodeViewProps;

  return renderToStaticMarkup(<AIPreviewBlockComponent {...props} />);
}

describe('AI Preview editor style boundary', () => {
  it('isolates controls from prose while leaving preview content in the editor content scope', () => {
    const html = renderPreview();

    expect(html).toMatch(/data-editor-ui="true" class="[^"]*\bnot-prose\b/);
    expect(html).toMatch(/data-editor-content="true" class="[^"]*\beditor-content\b/);
    expect(html).not.toMatch(/data-editor-content="true" class="[^"]*\bnot-prose\b/);
    expect(html).toContain('<h1>Preview heading</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('<code>inline code</code>');
  });

  it('uses semantic button classes without inline color overrides', () => {
    const html = renderPreview();

    expect(html).toContain('ui-btn ui-btn-muted ui-btn-xs');
    expect(html).toContain('ui-btn ui-btn-primary ui-btn-xs');
    expect(html).not.toMatch(/style="[^"]*color\s*:/);
  });

  it('defines light and dark prose links through theme variables without important selectors', () => {
    const css = readFileSync(
      new URL('../../../../app/globals.css', import.meta.url),
      'utf8'
    );

    expect(css).toMatch(/--editor-link:\s+#0b79c2;/);
    expect(css).toMatch(/--editor-link:\s+#3b95d9;/);
    expect(css).toContain('--tw-prose-links:       var(--editor-link);');
    expect(css).toContain('--tw-prose-invert-links: var(--editor-link);');
    expect(css).not.toMatch(/\.dark \.prose a/);
    expect(css).not.toMatch(/\[class\*="prose-"\] a/);
  });
});
