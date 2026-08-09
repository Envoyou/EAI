'use client';

import React from 'react';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useTranslations } from 'next-intl';

export interface DeleteDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export function DeleteDocumentDialog({
  open,
  onOpenChange,
  pending = false,
  title,
  description,
  confirmLabel,
  onConfirm,
}: DeleteDocumentDialogProps) {
  const t = useTranslations('DocumentHistory');

  return (
    <ConfirmDestructiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? t('deleteTitle')}
      description={description ?? t('deleteDescription')}
      confirmLabel={confirmLabel ?? t('delete')}
      cancelLabel={t('cancel')}
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}
