import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const aiConfigSource = readFileSync(
  new URL('../../app/[locale]/admin/ai-config/page.tsx', import.meta.url),
  'utf8',
);
const auditLogsSource = readFileSync(
  new URL('../../app/[locale]/admin/audit-logs/page.tsx', import.meta.url),
  'utf8',
);

describe('admin form-control contract', () => {
  it('uses canonical inputs throughout AI Config', () => {
    expect(aiConfigSource).not.toMatch(/<input\b/);
    expect(aiConfigSource.match(/<Input\b/g)).toHaveLength(2);
    expect(aiConfigSource.match(/variant="surface"/g)).toHaveLength(2);
    expect(aiConfigSource).not.toMatch(/ui-control|ui-input|ui-textarea|ui-select/);
  });

  it('uses canonical input and select APIs throughout Audit Logs', () => {
    expect(auditLogsSource).not.toMatch(/<input\b|<select\b/);
    expect(auditLogsSource.match(/<Input\b/g)).toHaveLength(1);
    expect(auditLogsSource.match(/<SelectTrigger\b/g)).toHaveLength(1);
    expect(auditLogsSource.match(/variant="surface"/g)).toHaveLength(2);
    expect(auditLogsSource).not.toMatch(/ui-control|ui-input|ui-textarea|ui-select/);
  });
});
