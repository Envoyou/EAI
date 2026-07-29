'use client';

import type { ReactNode } from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { Button } from '@/components/ui/button';
import { CancelActionIcon } from '@/components/ui/icons/actions';
import { cn } from '@/lib/utils';

type SideDrawerProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  className?: string;
};

export function SideDrawer({
  open,
  title,
  description,
  children,
  footer,
  closeLabel,
  onClose,
  className,
}: SideDrawerProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      swipeDirection="right"
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-[150] min-h-dvh bg-black/60 backdrop-blur-xs opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 data-starting-style:opacity-0 data-ending-style:opacity-0 data-swiping:duration-0" />
        <Drawer.Viewport className="fixed inset-0 z-[151] flex items-stretch justify-end">
          <Drawer.Popup
            className={cn(
              'flex h-full w-full max-w-2xl touch-auto flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl outline-none overscroll-contain',
              '[transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-300 ease-out',
              'data-starting-style:[transform:translateX(100%)] data-ending-style:[transform:translateX(100%)] data-swiping:select-none data-swiping:duration-0',
              className
            )}
          >
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">
              <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
                <div className="min-w-0">
                  <Drawer.Title className="line-clamp-2 text-base font-semibold">
                    {title}
                  </Drawer.Title>
                  {description ? (
                    <Drawer.Description className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {description}
                    </Drawer.Description>
                  ) : null}
                </div>
                <Button
                  render={<Drawer.Close />}
                  type="button"
                  variant="muted"
                  size="icon-xs"
                  aria-label={closeLabel}
                >
                  <CancelActionIcon className="h-4 w-4" />
                </Button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {children}
              </div>
              {footer ? (
                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3">
                  {footer}
                </footer>
              ) : null}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
