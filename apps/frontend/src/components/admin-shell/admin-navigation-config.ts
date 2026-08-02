import { NavigationItem } from '@/components/app-shell/navigation/navigation-types';
import {
  TenantsNavigationIcon as TenantsIcon,
  UserDirectoryNavigationIcon as UsersIcon,
  AiEngineNavigationIcon as CpuIcon,
  TelemetryNavigationIcon as ActivityIcon,
  FeatureFlagsNavigationIcon as ShieldAlertIcon,
  AuditLogsNavigationIcon as ScrollIcon,
} from '@/components/ui/icons/navigation';

export const ADMIN_SECTIONS: NavigationItem[] = [
  { id: 'tenants', href: '/admin/tenants', labelKey: 'tenants', icon: TenantsIcon, match: 'section' },
  { id: 'users', href: '/admin/users', labelKey: 'users', icon: UsersIcon, match: 'section' },
  { id: 'ai-config', href: '/admin/ai-config', labelKey: 'aiConfig', icon: CpuIcon, match: 'section' },
  { id: 'telemetry', href: '/admin/telemetry', labelKey: 'telemetry', icon: ActivityIcon, match: 'section' },
  { id: 'feature-flags', href: '/admin/feature-flags', labelKey: 'featureFlags', icon: ShieldAlertIcon, match: 'section' },
  { id: 'audit-logs', href: '/admin/audit-logs', labelKey: 'auditLogs', icon: ScrollIcon, match: 'section' },
];
