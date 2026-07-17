'use client';

import { useEffect, Dispatch, SetStateAction } from 'react';

interface UseWorkspaceKeyboardProps {
  setIsMobile: Dispatch<SetStateAction<boolean>>;
  setIsShortcutModalOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setRightPanelOpen: Dispatch<SetStateAction<boolean>>;
}

export function useWorkspaceKeyboard({
  setIsMobile,
  setIsShortcutModalOpen,
  setSidebarOpen,
  setRightPanelOpen,
}: UseWorkspaceKeyboardProps) {
  // Viewport resize detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsMobile]);

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
      if (e.key === '?' && !isInput) {
        setIsShortcutModalOpen(p => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !isInput) {
        e.preventDefault();
        if (e.shiftKey) {
          setRightPanelOpen(p => !p);
        } else {
          setSidebarOpen(p => !p);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsShortcutModalOpen, setSidebarOpen, setRightPanelOpen]);
}
