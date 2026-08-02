import { NavigationItem } from './navigation-types';
import {
  WorkspaceNavigationIcon,
  EditorNavigationIcon,
  ReviewNavigationIcon,
  PublicationNavigationIcon,
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
    id: 'editor',
    href: '/editor',
    labelKey: 'editor',
    icon: EditorNavigationIcon,
    match: 'section',
  },
  {
    id: 'review',
    href: '/review',
    labelKey: 'review',
    icon: ReviewNavigationIcon,
    match: 'section',
  },
  {
    id: 'publication',
    href: '/publication',
    labelKey: 'publication',
    icon: PublicationNavigationIcon,
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
