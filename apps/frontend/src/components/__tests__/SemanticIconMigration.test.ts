import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');
const semanticIconRoot = join(sourceRoot, 'components/ui/icons');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });

describe('semantic icon migration ratchet', () => {
  it('does not increase direct Lucide imports outside the token catalogs', () => {
    const legacyConsumers: string[] = [];
    let legacyImportedSymbols = 0;

    for (const path of sourceFiles(sourceRoot)) {
      if (path.startsWith(semanticIconRoot)) continue;

      const source = readFileSync(path, 'utf8');
      const lucideImports = [
        ...source.matchAll(
          /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]lucide-react['"]/g
        ),
      ];
      const importsLucideDirectly = lucideImports.length > 0;

      for (const match of lucideImports) {
        legacyImportedSymbols += match[1]
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean).length;
      }

      if (importsLucideDirectly) {
        legacyConsumers.push(relative(sourceRoot, path));
      }
    }

    expect(legacyConsumers.length).toBeLessThanOrEqual(72);
    expect(legacyImportedSymbols).toBeLessThanOrEqual(398);
  });
});
