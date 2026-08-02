'use client';

import React from 'react';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

export interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  sidebarOpen: boolean;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  isActive?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'danger' | 'ghost';
}

export function SidebarItem({
  icon: Icon,
  label,
  sidebarOpen,
  href,
  onClick,
  isActive,
  disabled,
  className = '',
  variant = 'default',
}: SidebarItemProps) {
  const baseClasses = `relative flex items-center transition-all duration-200 no-underline border-none cursor-pointer overflow-hidden ${
    sidebarOpen
      ? 'justify-start !px-3 !py-2.5 rounded-xl w-full'
      : 'justify-center w-9 h-9 rounded-xl mx-auto'
  }`;

  let colorClasses = 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]';

  if (isActive) {
    colorClasses = 'bg-[var(--surface-3)] text-[var(--foreground)] font-semibold shadow-xs border border-[var(--border)]';
  } else if (variant === 'danger') {
    colorClasses = 'text-[var(--error)] hover:bg-[var(--error)]/10 hover:text-[var(--error)]';
  } else if (disabled) {
    colorClasses = 'opacity-40 text-[var(--muted-foreground)] cursor-not-allowed hover:bg-transparent';
  }

  const innerContent = (
    <>
      {isActive && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[var(--primary)]"
          aria-hidden="true"
        />
      )}
      <div className="w-7 h-7 flex items-center justify-center shrink-0">
        <Icon className={`size-[18px] ${isActive ? 'text-[var(--foreground)]' : ''}`} aria-hidden="true" />
      </div>
      <span
        className={`text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'opacity-100 max-w-[200px] ml-2.5' : 'opacity-0 max-w-0 ml-0'
        }`}
      >
        {label}
      </span>
    </>
  );

  const combinedClasses = `${baseClasses} ${colorClasses} ${className}`;

  const renderTrigger = () => {
    if (href && !disabled) {
      return (
        <Button
          render={
            <Link
              href={href}
              aria-current={isActive ? 'page' : undefined}
              data-active={isActive || undefined}
            />
          }
          onClick={onClick}
          variant={isActive ? 'secondary' : 'ghost'}
          disabled={disabled}
          className={combinedClasses}
        >
          {innerContent}
        </Button>
      );
    }
    return (
      <Button
        type="button"
        onClick={disabled ? undefined : onClick}
        variant={isActive ? 'secondary' : 'ghost'}
        disabled={disabled}
        aria-current={isActive ? 'page' : undefined}
        data-active={isActive || undefined}
        className={combinedClasses}
      >
        {innerContent}
      </Button>
    );
  };

  return (
    <Tooltip disabled={sidebarOpen}>
      <TooltipTrigger render={renderTrigger()} />
      <TooltipContent side="right" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
