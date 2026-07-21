'use client';

import {
  MoreVertical,
  History,
  CreditCard,
  Mail,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
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
    <Menu.Root>
      <Menu.Trigger
        className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
        aria-label="User actions"
      >
        <MoreVertical className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="w-48 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1 shadow-lg text-xs font-semibold">
            <Menu.Item
              onClick={() => onOpenDetails(user)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--foreground)] cursor-pointer outline-none"
            >
              <History className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>View Audit Details</span>
            </Menu.Item>
            <Menu.Item
              onClick={() => onOpenAdjustCredits(user)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--foreground)] cursor-pointer outline-none"
            >
              <CreditCard className="h-3.5 w-3.5 text-[var(--warning)]" />
              <span>Adjust Credits</span>
            </Menu.Item>
            <Menu.Item
              onClick={() => onResendInvite(user)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--foreground)] cursor-pointer outline-none"
            >
              <Mail className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Send Invite Email</span>
            </Menu.Item>
            <Menu.Separator className="my-1 border-t border-[var(--border)]" />
            <Menu.Item
              onClick={() => onToggleBanConfirm(user)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer outline-none ${
                user.isBanned
                  ? 'text-[var(--success)] hover:bg-[var(--success)]/10'
                  : 'text-[var(--destructive)] hover:bg-[var(--destructive)]/10'
              }`}
            >
              {user.isBanned ? (
                <>
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Unban User</span>
                </>
              ) : (
                <>
                  <UserMinus className="h-3.5 w-3.5" />
                  <span>Ban User</span>
                </>
              )}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
