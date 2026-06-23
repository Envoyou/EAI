'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { EditorialProfileConfig } from '@/lib/editorial-profile';
import { useSettingsAction } from '@/components/SettingsActionProvider';

export interface ProfileVersion {
  id: string;
  version: number;
  configHash: string;
  createdAt: string;
  analysisCount: number;
}

export interface ProfileResponse {
  organization: {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  };
  profile: {
    id: string;
    key: string;
    name: string;
    isActive: boolean;
    latestVersion: number;
    config: EditorialProfileConfig;
    versions: ProfileVersion[];
  };
  coreGuardrailsVersion: string;
}

type PublicationContextValue = {
  data: ProfileResponse | null;
  form: Partial<EditorialProfileConfig>;
  loading: boolean;
  saving: boolean;
  hasChanges: boolean;
  updateField: <K extends keyof EditorialProfileConfig>(key: K, value: EditorialProfileConfig[K]) => void;
  saveProfile: () => Promise<void>;
};

const PublicationContext = createContext<PublicationContextValue | null>(null);

export function PublicationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { registerAction, unregisterAction } = useSettingsAction();
  
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<Partial<EditorialProfileConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/admin/editorial-profile', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch profile');
        const json = await res.json();
        setData(json);
        setForm(json.profile.config);
      } catch {
        toast.error('Unable to load publication settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const updateField = useCallback(<K extends keyof EditorialProfileConfig>(
    key: K,
    value: EditorialProfileConfig[K]
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setHasChanges(JSON.stringify(next) !== JSON.stringify(data?.profile.config));
      return next;
    });
  }, [data]);

  const saveProfile = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/editorial-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('Failed to save profile');
      const updated = await res.json();
      
      setData(updated);
      setForm(updated.profile.config);
      setHasChanges(false);
      toast.success('Publication settings saved successfully.');
    } catch {
      toast.error('Unable to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [data, form]);

  useEffect(() => {
    const isPublicationRoute = pathname?.startsWith('/settings/publication');
    if (isPublicationRoute) {
      registerAction('publication-settings', hasChanges, saveProfile);
    } else {
      unregisterAction('publication-settings');
    }
  }, [pathname, hasChanges, saveProfile, registerAction, unregisterAction]);

  return (
    <PublicationContext.Provider
      value={{
        data,
        form,
        loading,
        saving,
        hasChanges,
        updateField,
        saveProfile,
      }}
    >
      {children}
    </PublicationContext.Provider>
  );
}

export function usePublication() {
  const context = useContext(PublicationContext);
  if (!context) {
    throw new Error('usePublication must be used within a PublicationProvider');
  }
  return context;
}
