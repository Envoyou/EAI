import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../Editor.tsx', import.meta.url), 'utf8');
const metadataEnd = source.indexOf('{/* Textarea, Welcome Card, or AI Drafting Form based on state */}');
const metadataPanel = source.slice(
  source.indexOf('{/* Panel Header */}'),
  metadataEnd,
);

describe('Editor metadata control contract', () => {
  it('uses canonical components for every metadata field', () => {
    expect(metadataPanel).not.toMatch(/<input\b/);
    expect(metadataPanel).not.toMatch(/<textarea\b/);
    expect(metadataPanel.match(/<Input\b/g)).toHaveLength(4);
    expect(metadataPanel.match(/<SelectTrigger\b/g)).toHaveLength(2);
    expect(metadataPanel.match(/<Textarea\b/g)).toHaveLength(1);
  });

  it('preserves the filled metadata appearance through semantic surface variants', () => {
    expect(metadataPanel).not.toMatch(/ui-control|ui-input|ui-select|ui-textarea/);
    expect(metadataPanel.match(/variant="surface"/g)).toHaveLength(7);
  });

  it('keeps the raw Markdown canvas outside the metadata contract', () => {
    expect(source.slice(metadataEnd)).toMatch(/<textarea\b/);
  });
});
