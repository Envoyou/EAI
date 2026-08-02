import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('current article history projection', () => {
  const historyRoute = readFileSync(
    resolve(process.cwd(), 'src/routes/history.ts'),
    'utf8'
  );

  it('selects one current AnalysisLog per tenant-scoped sourceRef family', () => {
    expect(historyRoute).toContain("req.query.view === 'current'");
    expect(historyRoute).toContain('PARTITION BY COALESCE(NULLIF(log."metadata"->>\'sourceRef\', \'\'), log."id")');
    expect(historyRoute).toContain('ranked."revisionRank" = 1');
    expect(historyRoute).toContain('log."organizationId" = ${organizationId}');
    expect(historyRoute).toContain('ranked."feedback"');
  });
});
