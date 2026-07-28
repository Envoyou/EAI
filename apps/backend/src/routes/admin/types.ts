import { z } from 'zod';
import {
  AiProviderModelSchema,
  AiRuntimeConfigSchema,
} from '@eai/shared';

export const AdjustmentSchema = z.object({
  organizationId: z.string().min(1).max(100),
  direction: z.enum(['add', 'deduct']),
  amount: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(5).max(500),
  ticketReference: z.string().trim().min(2).max(100),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(150)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid idempotency key'),
  confirmed: z.literal(true),
});

export const OverridePlanSchema = z.object({
  organizationId: z.string().min(1).max(100),
  plan: z.string().min(1).max(50),
  durationDays: z.number().int().min(1).max(3650),
  reason: z.string().trim().min(5).max(500),
  ticketReference: z.string().trim().min(2).max(100),
});

export const UserCreditAdjustmentSchema = z.object({
  direction: z.enum(['add', 'deduct']),
  amount: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(5).max(500),
  ticketReference: z.string().trim().min(2).max(100),
  idempotencyKey: z.string().trim().min(8).max(150),
});

export const AiConfigSchema = z
  .union([
    AiRuntimeConfigSchema,
    z.object({
    provider: AiProviderModelSchema.shape.provider,
    model: z.string().trim().max(150).optional().nullable(),
    }).transform((legacy) => ({
      version: 1 as const,
      default: {
        provider: legacy.provider,
        model: legacy.model || null,
      },
      functions: {},
    })),
  ])
  .pipe(AiRuntimeConfigSchema);

export const AuditLogSchema = z.object({
  action: z.string().min(3).max(100),
  targetId: z.string().max(150).optional().nullable(),
  targetType: z.string().max(50).optional().nullable(),
  description: z.string().min(5).max(500),
  details: z.record(z.string(), z.any()).optional().nullable(),
});
