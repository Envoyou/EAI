import { ArticleMetadata } from '@eai/shared';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EditorialStrictness = 'balanced' | 'strict';
export type UserRole = 'writer' | 'editor' | 'admin';
export type UiLanguage = 'id' | 'en';
export type OutputLanguage = 'follow_draft' | 'id' | 'en';

export type UserProfile = {
  displayName: string;
  role: UserRole;
  language: UiLanguage;
};

export type AppSettings = {
  profile: UserProfile;
  themeMode: ThemeMode;
  autoSave: boolean;
  strictness: EditorialStrictness;
  outputLanguage: OutputLanguage;
  defaultMetadata: Pick<ArticleMetadata, 'category' | 'type' | 'targetAudience' | 'targetLength'>;
};

export const SETTINGS_STORAGE_KEY = 'eai-settings';
export const SETTINGS_CHANGE_EVENT = 'eai-settings-change';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  profile: {
    displayName: 'Editorial Team',
    role: 'editor',
    language: 'en',
  },
  themeMode: 'dark',
  autoSave: true,
  strictness: 'balanced',
  outputLanguage: 'en',
  defaultMetadata: {
    category: '',
    type: '',
    targetAudience: '',
    targetLength: '',
  },
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return DEFAULT_APP_SETTINGS;
  const source = value as Partial<AppSettings>;
  const profile: Partial<UserProfile> = source.profile && typeof source.profile === 'object'
    ? source.profile
    : {};
  const metadata = source.defaultMetadata && typeof source.defaultMetadata === 'object'
    ? source.defaultMetadata
    : {};

  return {
    profile: {
      displayName: typeof profile.displayName === 'string' && profile.displayName.trim()
        ? profile.displayName
        : DEFAULT_APP_SETTINGS.profile.displayName,
      role: profile.role === 'writer' || profile.role === 'admin' || profile.role === 'editor'
        ? profile.role
        : DEFAULT_APP_SETTINGS.profile.role,
      language: profile.language === 'en' ? 'en' : 'id',
    },
    themeMode: source.themeMode === 'light' || source.themeMode === 'system' || source.themeMode === 'dark'
      ? source.themeMode
      : DEFAULT_APP_SETTINGS.themeMode,
    autoSave: typeof source.autoSave === 'boolean' ? source.autoSave : DEFAULT_APP_SETTINGS.autoSave,
    strictness: source.strictness === 'strict' ? 'strict' : 'balanced',
    outputLanguage: source.outputLanguage === 'id' || source.outputLanguage === 'en' || source.outputLanguage === 'follow_draft'
      ? source.outputLanguage
      : DEFAULT_APP_SETTINGS.outputLanguage,
    defaultMetadata: {
      category: typeof metadata.category === 'string' ? metadata.category : '',
      type: typeof metadata.type === 'string' ? metadata.type : '',
      targetAudience: typeof metadata.targetAudience === 'string' ? metadata.targetAudience : '',
      targetLength: typeof metadata.targetLength === 'string' ? metadata.targetLength : '',
    },
  };
}

export function storeThemePreference(themeMode: ThemeMode): AppSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_APP_SETTINGS, themeMode };
  }

  let current = DEFAULT_APP_SETTINGS;
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    current = stored ? normalizeAppSettings(JSON.parse(stored)) : DEFAULT_APP_SETTINGS;
  } catch {
    current = DEFAULT_APP_SETTINGS;
  }

  const next = { ...current, themeMode };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_CHANGE_EVENT, { detail: next }));
  return next;
}

export function getProfileInitials(displayName: string) {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'EA';
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export function applyDefaultMetadata(defaultMetadata: AppSettings['defaultMetadata']): ArticleMetadata {
  return {
    ...(defaultMetadata.category ? { category: defaultMetadata.category } : {}),
    ...(defaultMetadata.type ? { type: defaultMetadata.type } : {}),
    ...(defaultMetadata.targetAudience ? { targetAudience: defaultMetadata.targetAudience } : {}),
    ...(defaultMetadata.targetLength ? { targetLength: defaultMetadata.targetLength } : {}),
  };
}
