export type ManualRevisionValidationLevel = 'none' | 'light' | 'full';

export const getBackgroundValidationDelay = (
  validationLevel: ManualRevisionValidationLevel | undefined
): number | null => {
  if (validationLevel === 'full') return 800;
  if (validationLevel === 'light') return 1_800;
  return null;
};
