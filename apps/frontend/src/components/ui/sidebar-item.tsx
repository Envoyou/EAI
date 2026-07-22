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
  const baseClasses = `flex items-center transition-all duration-300 no-underline border-none cursor-pointer overflow-hidden ${
    sidebarOpen
      ? 'justify-start !px-2.5 !py-2 rounded-full w-full'
      : 'justify-center w-9 h-9 rounded-full mx-auto'
  }`;

  let colorClasses = 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]';
  
  if (isActive) {
    colorClasses = 'bg-[var(--sidebar-accent)] text-[var(--foreground)] font-medium hover:bg-[var(--surface-2)]';
  } else if (variant === 'danger') {
    colorClasses = 'text-[var(--error)] hover:bg-[var(--error)] hover:text-white';
  } else if (disabled) {
    colorClasses = 'opacity-50 text-[var(--muted-foreground)] cursor-not-allowed hover:bg-transparent hover:text-[var(--muted-foreground)]';
  }

  const innerContent = (
    <>
      <div className="w-7 h-7 flex items-center justify-center shrink-0">
        <Icon className="size-[18px]" />
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
    if (href && !disabled && !onClick) {
      return (
        <Button
          render={<Link href={href} />}
          variant="ghost"
          disabled={disabled}
          className={`${combinedClasses} bg-transparent`}
        >
          {innerContent}
        </Button>
      );
    }
    return (
      <Button
        type="button"
        onClick={disabled ? undefined : onClick}
        variant="ghost"
        disabled={disabled}
        className={`${combinedClasses} bg-transparent`}
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
