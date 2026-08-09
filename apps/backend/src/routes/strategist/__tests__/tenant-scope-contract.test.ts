import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Strategist tenant scope contract', () => {
  const sessions = readSource('src/routes/strategist/handlers/sessions.ts');
  const chat = readSource('src/routes/strategist/handlers/chat.ts');
  const plan = readSource('src/routes/strategist/handlers/plan.ts');
  const schema = readSource('prisma/schema.prisma');
  const migration = readSource(
    'prisma/migrations/20260729143000_scope_strategist_records_to_tenant/migration.sql'
  );

  test('scopes session listing, reads, updates, and deletes to the active tenant', () => {
    expect(sessions).toContain(
      'const organizationId = await resolveInternalOrgId(req.auth!.orgId, userId)'
    );
    expect(sessions).toContain('where: scope');
    expect(
      sessions.match(/where: \{ id: sessionId, \.\.\.scope \}/g)
    ).toHaveLength(3);
    expect(sessions).not.toContain('where: { userId }');
    expect(sessions).toContain("path: ['plan']");
    expect(sessions).toContain('hasBlueprint: _count.messages > 0');
  });

  test('scopes chat sessions and durable request recovery to the active tenant', () => {
    expect(chat).toContain('organizationId: resolvedOrgId');
    expect(chat).toContain(
      'existingRequest.organizationId !== resolvedOrgId'
    );
    expect(chat).toContain('organizationId: claimedOrganizationId');
    expect(chat).toContain(
      'const chatRequest = await prisma.strategistChatRequest.findFirst'
    );
    expect(chat).not.toContain(
      'where: { id: sessionId, userId: req.auth.userId }'
    );
  });

  test('scopes blueprint sessions and durable request recovery to the active tenant', () => {
    expect(plan).toContain('organizationId: internalOrgId');
    expect(plan).toContain(
      'existingRequest.organizationId !== internalOrgId'
    );
    expect(plan).toContain('organizationId: claimedOrganizationId');
    expect(plan).toContain(
      'const planRequest = await prisma.strategistPlanRequest.findFirst'
    );
    expect(plan).not.toContain(
      'where: { id: sessionId, userId: req.auth.userId }'
    );
  });

  test('adds tenant indexes and backfills only from attributable sessions', () => {
    expect(schema).toContain('@@index([userId, organizationId])');
    expect(
      schema.match(/organizationId String\?/g)?.length
    ).toBeGreaterThanOrEqual(3);
    expect(migration).toContain(
      'ALTER TABLE "StrategistPlanRequest"'
    );
    expect(migration).toContain(
      'ALTER TABLE "StrategistChatRequest"'
    );
    expect(migration).toContain(
      'FROM "ChatSession" AS session'
    );
    expect(migration).not.toContain(
      'FROM "User"'
    );
  });
});
