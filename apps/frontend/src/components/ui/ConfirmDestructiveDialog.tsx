'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';

export interface ConfirmDestructiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  pending = false,
  onConfirm,
}: ConfirmDestructiveDialogProps) {
  const tDialog = useTranslations('ConfirmDestructiveDialog');

  if (!open) return null;

  const resolvedCancel = cancelLabel ?? tDialog('cancel');
  const resolvedConfirm = confirmLabel ?? tDialog('confirm');
  const resolvedPending = pendingLabel ?? tDialog('deleting');

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-5 animate-in fade-in duration-200"
      style={{ background: 'rgba(9,9,9,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-[320px] rounded-2xl border border-[var(--border)] p-5 space-y-4 shadow-2xl bg-[var(--card)] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-bold text-sm text-[var(--foreground)] tracking-tight">
            {title}
          </h3>
          <p className="text-xs mt-1 text-[var(--muted-foreground)] leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            variant="surface"
            size="sm"
            className="flex-1 rounded-full font-medium"
          >
            {resolvedCancel}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            variant="danger"
            size="sm"
            className="flex-1 rounded-full font-medium"
          >
            {pending ? (
              <EAILoaderStatusIcon className="w-3.5 h-3.5" />
            ) : null}
            <span>{pending ? resolvedPending : resolvedConfirm}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
