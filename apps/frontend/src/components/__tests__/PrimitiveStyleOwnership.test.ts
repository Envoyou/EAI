import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const primitiveFiles = new Set([
  'components/ui/button.tsx',
  'components/ui/badge.tsx',
  'components/ui/alert.tsx',
]);

function collectFeatureFiles(directory: string, relative = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const nextPath = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : collectFeatureFiles(nextPath, nextRelative);
    }

    return entry.name.endsWith('.tsx') && !primitiveFiles.has(nextRelative)
      ? [nextPath]
      : [];
  });
}

describe('semantic primitive style ownership', () => {
  it('keeps button, badge, and alert visual classes inside their primitives', () => {
    const violations = collectFeatureFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return /\bui-(?:btn|badge|alert)(?:-[\w-]+)?\b/.test(source)
        ? [file.replace(`${sourceRoot}/`, '')]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
