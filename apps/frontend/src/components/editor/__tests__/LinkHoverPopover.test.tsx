import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const popoverSource = readFileSync(new URL('../LinkHoverPopover.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../../Editor.tsx', import.meta.url), 'utf8');

describe('link hover overlay architecture', () => {
  it('uses a portaled, collision-aware positioner anchored to the hovered link', () => {
    expect(popoverSource).toContain('<Popover.Portal>');
    expect(popoverSource).toContain('<Popover.Positioner');
    expect(popoverSource).toContain('anchor={target.node}');
    expect(popoverSource).toContain('positionMethod="fixed"');
    expect(popoverSource).toContain('collisionAvoidance=');
    expect(popoverSource).toContain('not-prose');
    expect(popoverSource).not.toMatch(/position:\s*['"]absolute['"]/);
  });

  it('keeps overlay controls behind canonical component APIs', () => {
    expect(popoverSource).not.toMatch(/<button\b/);
    expect(popoverSource).not.toMatch(/<input\b/);
    expect(popoverSource.match(/<Button\b/g)).toHaveLength(4);
    expect(popoverSource.match(/<Input\b/g)).toHaveLength(2);
  });

  it('moves focus into edit mode and restores it when editing is cancelled', () => {
    expect(popoverSource).toContain('textInputRef.current?.focus()');
    expect(popoverSource).toContain('editButtonRef.current?.focus()');
  });

  it('removes manual viewport arithmetic from the editor orchestrator', () => {
    expect(editorSource).toContain('<LinkHoverPopover');
    expect(editorSource).not.toContain('getBoundingClientRect()');
    expect(editorSource).not.toContain('hoveredLink.top');
    expect(editorSource).not.toContain('hoveredLink.left');
  });
});
