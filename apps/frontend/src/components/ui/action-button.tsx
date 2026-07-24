import React from 'react';

import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';
import { LoadingStatusIcon } from '@/components/ui/icons/status';
import type { SemanticIconToken } from '@/components/ui/icons/types';

type ActionButtonProps = Omit<ButtonProps, 'children'> & {
  icon: SemanticIconToken;
  label: React.ReactNode;
  loading?: boolean;
  loadingLabel?: React.ReactNode;
  iconClassName?: string;
  labelClassName?: string;
};

function ActionButton({
  icon: Icon,
  label,
  loading = false,
  loadingLabel,
  iconClassName,
  labelClassName,
  disabled,
  'aria-label': ariaLabel,
  ...props
}: ActionButtonProps) {
  const RenderedIcon = loading ? LoadingStatusIcon : Icon;
  const renderedLabel = loading && loadingLabel !== undefined ? loadingLabel : label;

  return (
    <Button
      {...props}
      disabled={disabled || loading}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
    >
      <RenderedIcon
        aria-hidden="true"
        className={cn('size-4', loading && 'animate-spin', iconClassName)}
      />
      <span className={labelClassName}>{renderedLabel}</span>
    </Button>
  );
}

export { ActionButton, type ActionButtonProps };
