import type { EditorialReadiness } from '@eai/shared';

export const deriveCandidateDraftAvailability = (
  candidateBody: string | undefined,
  readiness: EditorialReadiness | undefined
) => ({
  hasCandidateDraft: Boolean(candidateBody?.trim()),
  isPublicationReady: readiness === 'ready',
});
