import { describe, test, expect } from 'vitest';
import { detectSourceFidelitySignals } from '@/lib/final-quality';

describe('detectSourceFidelitySignals code block exclusion', () => {
  test('should not flag hex colors or code attributes inside Mermaid diagrams as novel numbers', () => {
    const originalDraft = `
Metrik kesuksesan seorang developer bukan lagi seberapa cepat mereka mengetik sintaks.
Peralihan ini merupakan standar operasional bagi tim engineering.
`.trim();

    const finalDraft = `
The measure of a successful developer is no longer syntax typing speed.

\`\`\`mermaid
graph TD
    A[Define Goal & Specs] --> B[Agent Formulates Plan]
    B --> C[Write & Refine Code]
    C --> D[Run Local Tests]
    D -- Tests Fail --> E[Self-Debug & Fix]
    E --> C
    D -- Tests Pass --> F[Open Pull Request]
    F --> G[Human Review & Merge]
    style G fill:#f9f,stroke:#333,stroke-width:2px
\`\`\`

This autonomy is yielding unprecedented productivity gains.
`.trim();

    const signals = detectSourceFidelitySignals(originalDraft, finalDraft);

    expect(signals.novelNumbers).not.toContain('333');
    expect(signals.novelNumbers).not.toContain('2');
  });
});
