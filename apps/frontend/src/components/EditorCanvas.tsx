'use client';

import type { ReactNode } from 'react';

interface EditorCanvasProps {
  children: ReactNode;
}

export default function EditorCanvas({ children }: EditorCanvasProps) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {children}
    </div>
  );
}