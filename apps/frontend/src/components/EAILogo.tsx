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
      viewBox="0 0 500 500"
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
          <path d="M296.5 166.6c-6.4 3.3-6.4 3.3-36.25 56.25C221.6 291.55 199 332.4 199 333.7c0 1.85 28 1.75 33.3-.15 6.7-2.4 9.6-6.65 31.75-46.55 15.35-27.8 36.95-65.3 38.4-66.85 1.1-1.1 2.15.1 6.3 7C317.4 241.7 333 270.1 333 271.35c0 .35-5.3.65-11.85.65-18.45 0-22.4 1.1-29.75 8.45-5.5 5.45-16 21.25-14.9 22.4.25.25 16.95.7 37.1 1.05l36.65.6 3.8 6.5c13.8 23.55 13 23 35.6 23 9.55 0 17.35-.35 17.35-.75s-1-2.35-2.15-4.25c-2.4-3.85-8.45-14.8-37.85-68.5-19-34.7-31.35-57.15-41.7-75.8-10.2-18.35-18.4-23.55-28.8-18.1m-197 4.4c-21.65 2.35-40.7 19.3-44.4 39.45-1.4 7.65-1.45 76.8-.05 85.4 2.35 14.4 12.9 27.45 28.1 34.8 7.05 3.45 17.6 4.25 56.85 4.3l30.5.05 5.1-2.95c7.25-4.15 23.4-24.45 23.4-29.4 0-.3-22.85-.65-50.8-.85-62.8-.35-58.65 1.15-59.35-21.8l-.35-11.5 43.35-.5 43.35-.5 2.75-3.3c3.2-3.8 14.95-24.05 15.75-27.1l.55-2.1H87.7l.65-6.75c.35-3.7.65-8.5.65-10.65 0-3.2.7-4.6 4.25-8.1l4.25-4.25 56.7-.75 56.75-.75 8.85-16.1 8.85-16.15-2.55-.75c-3.1-.9-117.95-.65-126.6.25m320.35 3.55c-13.2 4.15-17.8 21.6-8.5 32.15 8.25 9.45 21.15 9.7 29.95.65 14.75-15.2-1-39.3-21.45-32.8M411 275.75c0 36.8.15 41.1 1.75 44.2 3.45 6.85 15.2 13.3 26.6 14.65l5.35.65.6-32.45c.35-17.85.35-40.4 0-50.15l-.6-17.65H411z"/>
        </g>
      </g>
    </svg>
  );
}
