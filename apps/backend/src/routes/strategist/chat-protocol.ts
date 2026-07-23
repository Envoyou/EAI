import type { Response } from 'express';
import { z } from 'zod';
import { ChatInputSchema } from './types';

export { ChatInputSchema };
export type { ChatInput } from './types';

export const StrategistSourceSchema = z.object({
  url: z.string(),
  domain: z.string(),
});

export const StrategistThinkingKindSchema = z.enum(['reasoning', 'grounding']);
export type StrategistThinkingKind = z.infer<typeof StrategistThinkingKindSchema>;

export const StrategistSseEventSchema = z.union([
  z.object({
    type: z.literal('heartbeat'),
  }),
  z.object({
    type: z.literal('session_init'),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal('deep_research_started'),
    interaction_id: z.string(),
    cancel_token: z.string(),
  }),
  z.object({
    type: z.literal('thinking'),
    kind: StrategistThinkingKindSchema,
    chunk: z.string(),
  }),
  z.object({
    type: z.literal('replace_text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('sources'),
    sources: z.array(StrategistSourceSchema),
  }),
  z.object({
    type: z.literal('done'),
  }),
  z
    .object({
      type: z.literal('error'),
      error: z.string().optional(),
      message: z.string().optional(),
    })
    .refine((event) => Boolean(event.error || event.message), {
      message: 'An error event must include error or message',
    }),
]);

export type StrategistSseEvent = z.infer<typeof StrategistSseEventSchema>;

export const StrategistStatusResponseSchema = z.object({
  state: z.string(),
  output: z.string(),
});

export type StrategistStatusResponse = z.infer<typeof StrategistStatusResponseSchema>;

export const StrategistCancelRequestSchema = z.object({
  cancelToken: z.string().min(1),
});

export const StrategistCancelResponseSchema = z.object({
  success: z.literal(true),
});

export type StrategistCancelResponse = z.infer<typeof StrategistCancelResponseSchema>;

export function setStrategistSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

export function writeStrategistSseEvent(
  res: Response,
  event: StrategistSseEvent
): boolean {
  if (res.writableEnded || res.destroyed) return false;
  const validatedEvent = StrategistSseEventSchema.parse(event);
  return res.write(`data: ${JSON.stringify(validatedEvent)}\n\n`);
}
