'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface DocumentHistorySearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sidebarOpen?: boolean;
  onExpandAndFocus?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  searchLabel?: string;
  searchPlaceholder?: string;
}

export function DocumentHistorySearch({
  searchQuery,
  onSearchChange,
  sidebarOpen = true,
  onExpandAndFocus,
  inputRef,
  searchLabel = 'Search drafts',
  searchPlaceholder = 'Search drafts…',
}: DocumentHistorySearchProps) {
  if (!sidebarOpen) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              onClick={onExpandAndFocus}
              variant="ghost"
              size="icon-sm"
              className="mt-1 mx-auto rounded-full text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              aria-label={searchLabel}
            >
              <Search className="w-4 h-4" />
            </Button>
          }
        />
        <TooltipContent side="right" className="text-xs">
          {searchLabel}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="relative flex items-center mt-1">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)] pointer-events-none z-10" />
      <Input
        variant="surface"
        ref={inputRef}
        type="text"
        name="draft-search"
        autoComplete="off"
        aria-label={searchLabel}
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="!pl-8 !pr-8 text-xs w-full"
      />
      {searchQuery && (
        <Button
          type="button"
          onClick={() => onSearchChange('')}
          variant="ghost"
          size="icon-xs"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--muted-foreground)] hover:bg-[var(--surface-3)]"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
