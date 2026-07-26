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
      viewBox="0 0 600 600"
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
        <g className={groupClass}
        stroke="currentColor" 
        strokeWidth="20"
        strokeLinejoin="round"
        strokeLinecap="round"
        >
          <path d="M289 67v56h22V10h-22zm89 11-21 53q0 2 9 5l10 4 1-2 21-52c22-56 21-51 15-53l-10-4-5-2zM187 33l-10 4 44 104 19-8-44-104zM95 95l-7 8 40 40 39 40 8-8 8-8-40-39-40-40zm362 33-39 39 7 8 8 8 40-40 39-40-7-8-8-7zm53 71-51 22 8 19 103-43 1-1-9-19zM34 184l-4 9-3 9 104 41q2 0 5-9l4-10-3-1-51-21-50-20zM10 300v11h113v-22H10zm279 0v11h301v-22H289zm178 58-4 10-3 8 3 1 51 21 50 19c1 1 9-18 9-19zM92 377l-51 22-12 5 9 19 103-44-9-19zm36 80-39 40 15 15 40-39 39-40-7-7-8-8zm298-31-7 7 39 40 40 39 15-15-79-79zm-56 37-9 4 20 48 22 51 1 5 20-9-45-103zm-146 0-40 101 19 9 41-104q0-2-9-5l-10-4zm66 71v56h22V477h-22z"/>
        </g>
      </g>
    </svg>
  );
}
