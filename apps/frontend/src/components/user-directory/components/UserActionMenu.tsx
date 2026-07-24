'use client';

import { ActionButton } from '@/components/ui/action-button';
import { AdaptiveActionMenu } from '@/components/ui/adaptive-action-menu';
import {
  MoreActionsIcon,
  RestoreUserActionIcon,
  SendInviteActionIcon,
  SuspendUserActionIcon,
} from '@/components/ui/icons/actions';
import { PaymentEntityIcon } from '@/components/ui/icons/entities';
import { HistoryNavigationIcon } from '@/components/ui/icons/navigation';
import type { DirectoryUser } from '../types';

interface UserActionMenuProps {
  user: DirectoryUser;
  onOpenDetails: (user: DirectoryUser) => void;
  onOpenAdjustCredits: (user: DirectoryUser) => void;
  onResendInvite: (user: DirectoryUser) => void;
  onToggleBanConfirm: (user: DirectoryUser) => void;
}

export function UserActionMenu({
  user,
  onOpenDetails,
  onOpenAdjustCredits,
  onResendInvite,
  onToggleBanConfirm,
}: UserActionMenuProps) {
  return (
    <AdaptiveActionMenu
      title="User actions"
      trigger={
        <ActionButton
          type="button"
          variant="muted"
          size="icon-sm"
          aria-label="User actions"
          icon={MoreActionsIcon}
          label="User actions"
          labelClassName="sr-only"
        />
      }
      items={[
        {
          key: 'details',
          label: 'View Audit Details',
          icon: HistoryNavigationIcon,
          onSelect: () => onOpenDetails(user),
        },
        {
          key: 'credits',
          label: 'Adjust Credits',
          icon: PaymentEntityIcon,
          onSelect: () => onOpenAdjustCredits(user),
        },
        {
          key: 'invite',
          label: 'Send Invite Email',
          icon: SendInviteActionIcon,
          onSelect: () => onResendInvite(user),
        },
        {
          key: 'ban',
          label: user.isBanned ? 'Unban User' : 'Ban User',
          icon: user.isBanned
            ? RestoreUserActionIcon
            : SuspendUserActionIcon,
          danger: !user.isBanned,
          separatorBefore: true,
          onSelect: () => onToggleBanConfirm(user),
        },
      ]}
    />
  );
}
