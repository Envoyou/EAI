'use client';

import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export interface SidebarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

export function SidebarDrawer({
  open,
  onOpenChange,
  ariaLabel = 'Navigation drawer',
  className = '',
  children,
}: SidebarDrawerProps) {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Save currently focused element to restore on close
    triggerRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus to trigger element on close
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, [open, onOpenChange]);

  return (
    <>
      {/* Centralized Navigation Backdrop */}
      <Button
        type="button"
        variant="ghost"
        className="workspace-page-sidebar-backdrop"
        data-open={open}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={`Close ${ariaLabel}`}
        onClick={() => onOpenChange(false)}
      />

      {/* Drawer Container (Flex wrapper for Rail + Context Sidebar) */}
      <div
        className={`flex h-full min-w-0 shrink-0 ${className}`}
        data-open={open}
        role="region"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </>
  );
}
