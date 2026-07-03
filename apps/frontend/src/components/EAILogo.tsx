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
          <path d="M308.4 10.3c-2.8 1.4-6.6 4.2-8.4 6.4s-10.6 17-19.5 32.9c-8.8 15.9-23 41-31.4 55.9-13.6 24-38.5 68.6-57.5 103l-6.6 12 19.1.3c20.6.3 25.1-.4 29.9-4.4 4.6-3.9 6.9-7.7 28.5-45.9 40-70.9 51.8-91.7 53.4-93.6 1.5-1.9 2.5-.4 19.9 30.9 10 18.1 18.2 33.4 18.2 34.1 0 1.1-2.6 1.2-12.7.7-14.3-.8-25.2.3-30.8 2.9-7 3.4-13.7 10.7-21.2 23.4-4 6.6-7.3 12.3-7.3 12.6s20.1.5 44.8.6c24.6.1 45.8.4 47.1.8 1.7.5 4.2 4.1 9.7 14.1 8.7 15.8 14 21.5 20.7 22.5 2.3.3 12.8.5 23.4.3l19.2-.3-3.9-6.7c-3.4-6-17.2-30.9-70.8-128.8-28.7-52.4-34.4-62.6-37.5-66.7-6.6-8.6-17-11.4-26.3-7M52.9 17.6c-12.5 3.2-20 7.5-29.5 16.9-6.2 6.1-9 9.8-11.7 15.5C5 63.7 5 63.9 5 119c0 54.5.2 56.5 6.2 68.9 4.6 9.5 16.9 21.6 26.8 26.5 13.2 6.4 16.6 6.7 67.9 6.4l45.6-.3 5.3-2.8c9.9-5.2 16.5-13.1 27-32l3.2-5.7h-60.8c-65.6 0-68.3-.2-72.9-5.2-4.1-4.6-4.7-7-5.1-22l-.4-14.7 53.3-.3 53.4-.3 3.3-2.3c3.1-2.3 8.8-11.2 18.5-29.4 2.6-4.7 4.7-8.9 4.7-9.2s-30-.6-66.6-.6H47.8l.4-12.9c.3-11.6.6-13.2 2.8-16.4 1.4-2 4.3-4.6 6.5-5.9l4-2.3 69.8-.5 69.8-.5L211.6 38c5.8-10.7 10.9-19.9 11.5-20.4.5-.6.9-1.3.9-1.7 0-.5-36.5-.7-81.1-.6-80.5.1-81.2.1-90 2.3m406.3 4c-22.8 11.4-16 46 9.6 48.2 7.3.6 13.4-1.4 18.8-6.1 10.6-9.4 12.2-22.3 4.1-34.3-6.7-10.1-21.1-13.5-32.5-7.8M451 96.2c0 .2-.1 22.8-.1 50.3-.2 55.7-.4 53.6 6.8 61.6 6.3 6.9 21.1 12.8 32.4 12.9h3.6l.5-37.2c.4-20.5.4-48.7.1-62.6l-.6-25.2h-21.3c-11.8 0-21.4.1-21.4.2"/>
        </g>
      </g>
    </svg>
  );
}
