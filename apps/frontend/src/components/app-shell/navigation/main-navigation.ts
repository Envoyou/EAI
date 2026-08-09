import { NavigationItem } from './navigation-types';
import {
  WorkspaceNavigationIcon,
  DocumentNavigationIcon,
  DashboardNavigationIcon,
} from '@/components/ui/icons/navigation';

export const MAIN_NAVIGATION: NavigationItem[] = [
  {
    id: 'workspace',
    href: '/workspace',
    labelKey: 'workspace',
    icon: WorkspaceNavigationIcon,
    match: 'exact',
  },
  {
    id: 'articles',
    href: '/articles',
    labelKey: 'articles',
    icon: DocumentNavigationIcon,
    match: 'section',
  },
  {
    id: 'dashboard',
    href: '/dashboard',
    labelKey: 'dashboard',
    icon: DashboardNavigationIcon,
    match: 'section',
  },
];
