import React from 'react';
import {
  UserPreferencesIcon,
  SettingsNavigationIcon,
  WorkflowNavigationIcon,
  DocumentNavigationIcon,
  OrganizationNavigationIcon,
  BillingNavigationIcon,
  TelemetryNavigationIcon,
} from '@/components/ui/icons/navigation';

export interface SettingsSectionItem {
  id: string;
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  heading?: boolean;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSectionItem[] = [
  { id: 'general_heading', label: 'My Preferences', heading: true },
  { id: 'account', href: '/settings/account', label: 'Preferences', icon: UserPreferencesIcon },
  { id: 'general', href: '/settings/general', label: 'General', icon: SettingsNavigationIcon },
  { id: 'workflow', href: '/settings/workflow', label: 'Workflow', icon: WorkflowNavigationIcon },
  { id: 'defaults', href: '/settings/defaults', label: 'Article Defaults', icon: DocumentNavigationIcon },
  
  { id: 'organization', label: 'Organization', heading: true, requireAdmin: true },
  { id: 'workspace', href: '/settings/workspace', label: 'Workspace', icon: OrganizationNavigationIcon, requireAdmin: true },
  { id: 'billing', href: '/settings/billing', label: 'Billing & Plans', icon: BillingNavigationIcon, requireAdmin: true },
  { id: 'usage', href: '/settings/usage', label: 'Credit Usage', icon: TelemetryNavigationIcon, requireAdmin: true },
  { id: 'publication', href: '/settings/publication/identity', label: 'Publication Standards', icon: DocumentNavigationIcon, requireAdmin: true },
];
