'use client';

import React from 'react';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useTranslations } from 'next-intl';

export interface DeleteDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function DeleteDocumentDialog({
  open,
  onOpenChange,
  pending = false,
  onConfirm,
}: DeleteDocumentDialogProps) {
  const t = useTranslations('DocumentHistory');

  return (
    <ConfirmDestructiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('deleteTitle')}
      description={t('deleteDescription')}
      confirmLabel={t('delete')}
      cancelLabel={t('cancel')}
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}
