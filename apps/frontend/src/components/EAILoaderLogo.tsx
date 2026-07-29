'use client';

import { useId } from 'react';

export function EAILoaderLogo({ className }: { className?: string }) {
  const baseId = useId().replace(/:/g, '');
  const maskId = `eai-sweep-mask-${baseId}`;
  const spinnerGroupClass = `eai-spinner-group-${baseId}`;
  const maskCircleClass = `eai-mask-circle-${baseId}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 600"
      className={className}
      aria-label="EAI Animated Loader"
    >
      <defs>
        <style>{`
          .${spinnerGroupClass} {
            animation: eaiSpin-${baseId} 2s linear infinite;
            transform-origin: 300px 300px;
            transform-box: view-box;
          }

          .${maskCircleClass} {
            fill: none;
            stroke: white;
            stroke-width: 300px;
            stroke-dasharray: 942.5;
            stroke-dashoffset: 942.5;
            animation: eaiDash-${baseId} 2.5s ease-in-out infinite;
            transform-origin: 300px 300px;
            transform-box: view-box;
            transform: rotate(-90deg);
          }

          @keyframes eaiSpin-${baseId} {
            100% { transform: rotate(360deg); }
          }

          @keyframes eaiDash-${baseId} {
            0%   { stroke-dashoffset: 942.5; }
            50%  { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -942.5; }
          }
        `}</style>
        <mask id={maskId}>
          <circle className={maskCircleClass} cx="300" cy="300" r="150" />
        </mask>
      </defs>

      <g className={spinnerGroupClass} mask={`url(#${maskId})`}>
        <path
          fill="#0b79c2"
          stroke="currentColor"
          strokeWidth="20"
          strokeLinejoin="round"
          strokeLinecap="round"
          d="M289 67v56h22V10h-22zm89 11-21 53q0 2 9 5l10 4 1-2 21-52c22-56 21-51 15-53l-10-4-5-2zM187 33l-10 4 44 104 19-8-44-104zM95 95l-7 8 40 40 39 40 8-8 8-8-40-39-40-40zm362 33-39 39 7 8 8 8 40-40 39-40-7-8-8-7zm53 71-51 22 8 19 103-43 1-1-9-19zM34 184l-4 9-3 9 104 41q2 0 5-9l4-10-3-1-51-21-50-20zM10 300v11h113v-22H10zm279 0v11h301v-22H289zm178 58-4 10-3 8 3 1 51 21 50 19c1 1 9-18 9-19zM92 377l-51 22-12 5 9 19 103-44-9-19zm36 80-39 40 15 15 40-39 39-40-7-7-8-8zm298-31-7 7 39 40 40 39 15-15-79-79zm-56 37-9 4 20 48 22 51 1 5 20-9-45-103zm-146 0-40 101 19 9 41-104q0-2-9-5l-10-4zm66 71v56h22V477h-22z"
        />
      </g>
    </svg>
  );
}

