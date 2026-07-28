import { z } from 'zod';
import type { ArticleMetadata } from '@eai/shared';

export const ChatInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(25_000),
      }).passthrough()
    )
    .min(1, 'At least one message is required')
    .max(50),
  sessionId: z.string().optional(),
  mode: z.enum(['fast', 'deep']).optional(),
  notesSummary: z.string().max(15_000).optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string().min(1).max(255),
        r2Key: z.string(),
        publicUrl: z.string(),
        contentType: z.string().max(255),
        extractedText: z.string().max(250_000),
        uploadedAt: z.string(),
      })
    )
    .max(5)
    .optional(),
  enableSearch: z.boolean().optional(),
  activeHistoryId: z.string().optional(),
});

export type ChatInput = z.infer<typeof ChatInputSchema>;

export const GeneratePlanSchema = z.object({
  requestId: z.uuid().optional(),
  recommendation: z.string().min(1, 'Recommendation is required').max(20_000),
  history: z
    .array(
      z.object({
        role: z.string(),
        content: z.string().max(25_000),
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
    .max(50)
    .optional(),
  sessionId: z.string().optional(),
});

export type GeneratePlanInput = z.infer<typeof GeneratePlanSchema>;

export const GenerateDraftFromNotesSchema = z.object({
  notes: z
    .array(
      z.object({
        content: z.string().min(1).max(25_000),
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
    .min(1, 'At least one note is required')
    .max(20),
  metadata: z.custom<ArticleMetadata>().optional(),
});

export type GenerateDraftFromNotesInput = z.infer<
  typeof GenerateDraftFromNotesSchema
>;

export const QuickDraftSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(2_000),
  outline: z.string().max(15_000).optional(),
  referenceText: z.string().max(25_000).optional(),
  metadata: z.custom<ArticleMetadata>().optional(),
  draftMode: z.enum(['topic', 'outline', 'reference', 'press_release']).optional(),
  mode: z.enum(['draft', 'outline']).optional(),
});

export interface GroundingAnnotation {
  type: string;
  url?: string;
  title?: string;
}

export interface UniqueSource {
  url: string;
  domain: string;
}
