import { z } from 'zod';
import type { ArticleMetadata } from '@eai/shared';

export const ChatInputSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  sessionId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        payload: z
          .object({
            sources: z
              .array(
                z.object({
                  url: z.string(),
                  domain: z.string(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
  fastMode: z.boolean().optional(),
  attachedFileUrl: z.string().optional(),
  attachedFileName: z.string().optional(),
  targetUrl: z.string().optional(),
});

export type ChatInput = z.infer<typeof ChatInputSchema>;

export const GeneratePlanSchema = z.object({
  recommendation: z.string().min(1, 'Recommendation is required'),
  history: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
        payload: z
          .object({
            sources: z
              .array(
                z.object({
                  url: z.string(),
                  domain: z.string(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
  sessionId: z.string().optional(),
});

export type GeneratePlanInput = z.infer<typeof GeneratePlanSchema>;

export const GenerateDraftFromNotesSchema = z.object({
  notes: z
    .array(
      z.object({
        content: z.string(),
        sources: z
          .array(
            z.object({
              url: z.string(),
              domain: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .min(1, 'At least one note is required'),
  metadata: z.custom<ArticleMetadata>().optional(),
});

export type GenerateDraftFromNotesInput = z.infer<
  typeof GenerateDraftFromNotesSchema
>;

export interface GroundingAnnotation {
  type: string;
  url?: string;
  title?: string;
}

export interface UniqueSource {
  url: string;
  domain: string;
}
