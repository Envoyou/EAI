'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  SETTINGS_CHANGE_EVENT,
  SETTINGS_STORAGE_KEY,
  ThemeMode,
  normalizeAppSettings,
  storeThemePreference,
} from '@/lib/preferences';
import { useSettingsAction } from '@/components/SettingsActionProvider';

export type WorkspaceConfig = {
  organization: {
    name: string;
    clerkOrganizationId: string | null;
  };
  editorial: {
    brandName: string;
    categories: string[];
    articleTypes: string[];
  };
  plan: {
    activePlan: string;
    creditsRemaining: number;
    subscriptionStatus: string;
  };
};

type SettingsContextValue = {
  settings: AppSettings;
  savedSettings: AppSettings;
  workspace: WorkspaceConfig | null;
  loadingWorkspace: boolean;
  hasChanges: boolean;
  isMounted: boolean;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateTheme: (themeMode: ThemeMode) => void;
  saveSettings: () => void;
  resetSettings: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

const readSettings = () => {
  if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS;
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return stored ? normalizeAppSettings(JSON.parse(stored)) : DEFAULT_APP_SETTINGS;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
};

const subscribeToClient = () => () => {};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const pathname = usePathname();
  const { registerAction, unregisterAction } = useSettingsAction();
  
  const isMounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false
  );

  const [settings, setSettings] = useState<AppSettings>(readSettings);
  const [savedSettings, setSavedSettings] = useState<AppSettings>(readSettings);
  const [workspace, setWorkspace] = useState<WorkspaceConfig | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/workspace/config', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Workspace request failed with HTTP ${response.status}.`);
        return response.json();
      })
      .then((data: WorkspaceConfig) => setWorkspace(data))
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        toast.error('Unable to load workspace settings.');
      })
      .finally(() => setLoadingWorkspace(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const syncSettings = (event: Event) => {
      const next = (event as CustomEvent<AppSettings>).detail;
      if (!next) return;
      setSettings((current) => ({ ...current, themeMode: next.themeMode }));
      setSavedSettings((current) => ({ ...current, themeMode: next.themeMode }));
    };

    window.addEventListener(SETTINGS_CHANGE_EVENT, syncSettings);
    return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, syncSettings);
  }, []);

  const hasChanges = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [savedSettings, settings]
  );

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const updateTheme = (themeMode: ThemeMode) => {
    storeThemePreference(themeMode);
    setTheme(themeMode);
  };

  const saveSettings = useCallback(() => {
    const normalized = normalizeAppSettings(settings);
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    setSettings(normalized);
    setSavedSettings(normalized);
    setTheme(normalized.themeMode);
    toast.success('Settings saved.');
  }, [settings, setTheme]);

  useEffect(() => {
    const isPublicationRoute = pathname?.startsWith('/settings/publication');
    if (!isPublicationRoute) {
      registerAction('app-settings', hasChanges, saveSettings);
    } else {
      unregisterAction('app-settings');
    }
  }, [pathname, hasChanges, saveSettings, registerAction, unregisterAction]);

  const resetSettings = () => {
    setSettings(DEFAULT_APP_SETTINGS);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        savedSettings,
        workspace,
        loadingWorkspace,
        hasChanges,
        isMounted,
        updateSettings,
        updateTheme,
        saveSettings,
        resetSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
