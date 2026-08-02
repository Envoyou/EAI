'use client';

import { useEffect, useState } from 'react';

export interface ResponsiveAppLayout {
  isDesktop: boolean;
  isCompact: boolean;
  isMobile: boolean;
  hasMounted: boolean;
}

export function useResponsiveAppLayout(): ResponsiveAppLayout {
  const [layout, setLayout] = useState<ResponsiveAppLayout>({
    isDesktop: false,
    isCompact: false,
    isMobile: false,
    hasMounted: false,
  });

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1025px)');
    const mobileQuery = window.matchMedia('(max-width: 640px)');

    const update = () => {
      setLayout({
        isDesktop: desktopQuery.matches,
        isCompact: !desktopQuery.matches && !mobileQuery.matches,
        isMobile: mobileQuery.matches,
        hasMounted: true,
      });
    };

    update();

    desktopQuery.addEventListener('change', update);
    mobileQuery.addEventListener('change', update);

    return () => {
      desktopQuery.removeEventListener('change', update);
      mobileQuery.removeEventListener('change', update);
    };
  }, []);

  return layout;
}
