import React from 'react';

export interface NavigationItem {
  id: string;
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: 'exact' | 'section';
  disabled?: boolean;
  demoOnlyLock?: boolean;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
}
