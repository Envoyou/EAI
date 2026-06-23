import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

const shortcuts = [
  { key: 'Ctrl + Enter', desc: 'Refine the current draft' },
  { key: '?', desc: 'Open or close this guide' },
  { key: 'Esc', desc: 'Close this guide' },
];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close keyboard shortcuts"
        className="absolute inset-0 border-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg p-5 shadow-xl animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="ui-btn ui-btn-muted ui-btn-icon absolute top-3 right-3"
          aria-label="Close keyboard shortcuts"
        >
          <X className="w-4 h-4" />
        </button>
        
        <h2 id="shortcuts-title" className="text-base font-semibold mb-4">
          Keyboard Shortcuts
        </h2>
        
        <div className="divide-y divide-[var(--border-subtle)]">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-[var(--muted-foreground)]">{s.desc}</span>
              <kbd 
                className="inline-flex shrink-0 items-center rounded-sm px-2 py-1 text-xs font-mono font-medium"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
