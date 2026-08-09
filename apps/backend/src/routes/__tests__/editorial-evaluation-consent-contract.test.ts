import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoute = readFileSync(resolve(__dirname, '../workspace.ts'), 'utf8');
const evaluationService = readFileSync(
  resolve(__dirname, '../../lib/editorial-evaluation.ts'),
  'utf8',
);

describe('tenant editorial evaluation consent contract', () => {
  it('allows only the active workspace administrator to change consent and audits the decision', () => {
    const start = workspaceRoute.indexOf("router.put('/editorial-evaluation-consent'");
    const contract = workspaceRoute.slice(start);

    expect(start).toBeGreaterThan(-1);
    expect(contract).toContain('if (!workspace.isAdmin)');
    expect(contract).toContain("action: 'workspace.editorial_evaluation_consent.update'");
    expect(contract).toContain('editorialEvaluationConsentByUserId: userId');
    expect(contract).toContain('prisma.$transaction');
  });

  it('requires explicit tenant opt-in for capture and every backfill source', () => {
    expect(evaluationService).toContain('hasTenantEditorialEvaluationConsent');
    expect(evaluationService).toContain('editorialEvaluationConsent: true');
    expect(evaluationService).toContain('if (!organizationId) return false');
  });
});
