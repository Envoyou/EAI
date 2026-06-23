'use client';

import { useId } from 'react';

export function EAILogo({ className }: { className?: string }) {
  const baseId = useId().replace(/:/g, '');
  const brandGradId = `eai-brand-grad-${baseId}`;
  const defaultGradId = `eai-default-grad-${baseId}`;
  const groupClass = `eai-logo-group-${baseId}`;
  const wrapClass = `eai-logo-wrap-${baseId}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      aria-label="EAI Logo"
    >
      <defs>
        <linearGradient id={brandGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#38BDF8" />
          <stop offset="50%"  stopColor="#0D87CF" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id={defaultGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <style>{`
        .${groupClass} {
          fill: url(#${defaultGradId});
          transition: fill 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .${wrapClass}:hover .${groupClass} {
          fill: url(#${brandGradId});
        }
      `}</style>
      <g className={wrapClass}>
        <g className={groupClass}>
          <path d="M68.1 88.5c-6.3 14.9-10.2 28.3-12 41-.9 6.1-.7 7.4 1.6 13.9 11.8 32.7 41.9 64.8 86.1 91.3 12.4 7.5 45.1 23.7 45.9 22.9.4-.3.2-.6-.3-.6-1.5 0-22.9-12.5-30.3-17.7-54.7-38.5-84.1-87.7-87-145.7l-.6-13.1z"/>
          <path d="M52.5 151.3c-1.3 9.8.1 37.2 2.3 46.7 5.4 23.1 15.6 44.4 31.5 66 9.3 12.6 34.4 37.4 48.7 48.2 42.9 32.3 97.4 56.2 159.6 70.2 8.9 2 16.9 3.6 17.8 3.6s1.5.3 1.3.8c-.3.4-14.8 10.4-32.2 22.2l-31.7 21.5 55.7.3 55.6.2 32.7-22.1c43.8-29.5 89.6-60.6 95.7-64.8l4.9-3.4-2.4-1.6c-2.6-1.7-78.7-53.2-111.5-75.5l-20-13.6-55.9.2-55.9.3 34.6 23.4c19.1 12.8 34.7 23.4 34.7 23.6 0 .9-41.4-7.1-59.3-11.6-99.5-25-173.3-71.8-199.2-126.4-2.3-5-4.7-10.1-5.2-11.5-.9-2.2-1.1-1.9-1.8 3.3"/>
        </g>
      </g>
    </svg>
  );
}
