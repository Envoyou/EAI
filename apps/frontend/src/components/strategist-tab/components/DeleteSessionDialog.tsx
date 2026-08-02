'use client';

import React from 'react';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

export interface DeleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionTitle?: string;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function DeleteSessionDialog({
  open,
  onOpenChange,
  sessionTitle,
  pending = false,
  onConfirm,
}: DeleteSessionDialogProps) {
  const title = sessionTitle ? `Delete "${sessionTitle}"?` : 'Delete Chat Session?';

  return (
    <ConfirmDestructiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="This action will permanently delete this AI research session. You cannot undo this action."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}
