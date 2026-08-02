import { NavigationItem } from './navigation-types';
import {
  TelemetryNavigationIcon as OverviewIcon,
  EditorNavigationIcon as PerformanceIcon,
  ReviewNavigationIcon as TrendsIcon,
  UserDirectoryNavigationIcon as ProductivityIcon,
  WorkspaceNavigationIcon as ContentMapIcon,
  FeatureFlagsNavigationIcon as ValidationIcon,
} from '@/components/ui/icons/navigation';

export const DASHBOARD_SECTIONS: NavigationItem[] = [
  { id: 'overview', href: '/dashboard/overview', labelKey: 'overview', icon: OverviewIcon, match: 'exact' },
  { id: 'performance', href: '/dashboard/performance', labelKey: 'performance', icon: PerformanceIcon, match: 'exact' },
  { id: 'trends', href: '/dashboard/trends', labelKey: 'trends', icon: TrendsIcon, match: 'exact' },
  { id: 'productivity', href: '/dashboard/productivity', labelKey: 'productivity', icon: ProductivityIcon, match: 'exact' },
  { id: 'content-map', href: '/dashboard/content-map', labelKey: 'contentMap', icon: ContentMapIcon, match: 'exact' },
];

export const DASHBOARD_SUPERADMIN_SECTIONS: NavigationItem[] = [
  { id: 'validation', href: '/dashboard/validation', labelKey: 'validation', icon: ValidationIcon, match: 'exact', requireSuperAdmin: true },
];
