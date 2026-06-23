'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type SettingsActionContextValue = {
  isDirty: boolean;
  isSaving: boolean;
  registerAction: (id: string, dirty: boolean, saveFn: () => Promise<void> | void) => void;
  unregisterAction: (id: string) => void;
  triggerSave: () => Promise<void>;
};

const SettingsActionContext = createContext<SettingsActionContextValue | null>(null);

export function SettingsActionProvider({ children }: { children: React.ReactNode }) {
  const [isSaving, setIsSaving] = useState(false);
  
  // We store the current active action using a ref and state
  const activeActionIdRef = useRef<string | null>(null);
  const [activeAction, setActiveAction] = useState<{ id: string; dirty: boolean; saveFn: () => Promise<void> | void } | null>(null);

  const registerAction = useCallback((id: string, dirty: boolean, saveFn: () => Promise<void> | void) => {
    activeActionIdRef.current = id;
    setActiveAction({ id, dirty, saveFn });
  }, []);

  const unregisterAction = useCallback((id: string) => {
    if (activeActionIdRef.current === id) {
      activeActionIdRef.current = null;
      setActiveAction(null);
    }
  }, []);

  const triggerSave = useCallback(async () => {
    if (!activeAction || !activeAction.saveFn) return;
    setIsSaving(true);
    try {
      await activeAction.saveFn();
    } finally {
      setIsSaving(false);
    }
  }, [activeAction]);

  const isDirty = activeAction?.dirty ?? false;

  return (
    <SettingsActionContext.Provider
      value={{
        isDirty,
        isSaving,
        registerAction,
        unregisterAction,
        triggerSave,
      }}
    >
      {children}
    </SettingsActionContext.Provider>
  );
}

export function useSettingsAction() {
  const context = useContext(SettingsActionContext);
  if (!context) {
    throw new Error('useSettingsAction must be used within a SettingsActionProvider');
  }
  return context;
}
