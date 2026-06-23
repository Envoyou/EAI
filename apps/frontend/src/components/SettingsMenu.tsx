'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AppSettings } from '@/lib/preferences';

type SettingsMenuProps = {
  variant?: 'activitybar' | 'toolbar';
  settings?: AppSettings;
  onSettingsChange?: (settings: AppSettings) => void;
  isDemoMode?: boolean;
};

export function SettingsMenu({
  variant = 'toolbar',
  isDemoMode = false,
}: SettingsMenuProps) {
  const router = useRouter();

  const openSettings = () => {
    toast.error('Settings are available after signing in.', {
      action: {
        label: 'Sign In',
        onClick: () => router.push('/login'),
      },
    });
  };

  if (variant === 'activitybar') {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            isDemoMode ? (
              <button
                type="button"
                id="activitybar-settings"
                onClick={openSettings}
                className="ide-activitybar-btn opacity-50"
                aria-label="Settings require sign in"
              >
                <Settings className="h-4 w-4" />
              </button>
            ) : (
              <Link
                id="activitybar-settings"
                href="/settings"
                className="ide-activitybar-btn"
                aria-label="Open Settings"
                prefetch={false}
              >
                <Settings className="h-4 w-4" />
              </Link>
            )
          }
        />
        <TooltipContent side="right" className="text-xs">
          Settings
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isDemoMode) {
    return (
      <Button type="button" variant="outline" onClick={openSettings}>
        <Settings />
        Settings
      </Button>
    );
  }

  return (
    <Button variant="outline" render={<Link href="/settings" prefetch={false} />}>
      <Settings />
      Settings
    </Button>
  );
}
