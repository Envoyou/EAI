import { Popover } from '@base-ui/react/popover';
import { FileEdit, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface HoveredLinkTarget {
  href: string;
  text: string;
  node: HTMLAnchorElement;
  pos: number;
}

interface LinkHoverPopoverProps {
  target: HoveredLinkTarget;
  isEditing: boolean;
  href: string;
  text: string;
  onHrefChange: (href: string) => void;
  onTextChange: (text: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onRemove: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function LinkHoverPopover({
  target,
  isEditing,
  href,
  text,
  onHrefChange,
  onTextChange,
  onEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: LinkHoverPopoverProps) {
  const textInputId = useId();
  const hrefInputId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const wasEditingRef = useRef(isEditing);

  useEffect(() => {
    if (isEditing) {
      textInputRef.current?.focus();
    } else if (wasEditingRef.current) {
      editButtonRef.current?.focus();
    }

    wasEditingRef.current = isEditing;
  }, [isEditing]);

  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={target.node}
          side="bottom"
          align="center"
          sideOffset={8}
          positionMethod="fixed"
          collisionAvoidance={{ side: 'flip', align: 'shift', fallbackAxisSide: 'none' }}
          className="isolate z-50"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            aria-label="Link actions"
            onMouseEnter={onMouseEnter}
            onMouseLeave={isEditing ? undefined : onMouseLeave}
            className="not-prose flex w-[min(280px,calc(100vw-2rem))] flex-col justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs shadow-xl backdrop-blur-md"
          >
            {!isEditing ? (
              <div className="flex items-center justify-between gap-3">
                <a
                  href={target.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-[180px] flex-1 truncate text-left font-medium text-[var(--primary)] hover:underline"
                >
                  {target.href}
                </a>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    ref={editButtonRef}
                    type="button"
                    variant="muted"
                    size="icon-sm"
                    onClick={onEdit}
                    aria-label="Edit link"
                    title="Edit link"
                  >
                    <FileEdit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="icon-sm"
                    onClick={onRemove}
                    aria-label="Remove link"
                    title="Remove link"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1 text-left">
                  <label
                    htmlFor={textInputId}
                    className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                  >
                    Text
                  </label>
                  <Input
                    ref={textInputRef}
                    id={textInputId}
                    type="text"
                    value={text}
                    onChange={(event) => onTextChange(event.target.value)}
                    className="h-7 text-xs"
                    placeholder="Link text..."
                  />
                </div>
                <div className="flex flex-col gap-1 text-left">
                  <label
                    htmlFor={hrefInputId}
                    className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                  >
                    URL
                  </label>
                  <Input
                    id={hrefInputId}
                    type="text"
                    value={href}
                    onChange={(event) => onHrefChange(event.target.value)}
                    className="h-7 text-xs"
                    placeholder="https://..."
                  />
                </div>
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <Button type="button" variant="muted" size="xs" onClick={onCancelEdit}>
                    Cancel
                  </Button>
                  <Button type="button" variant="primary" size="xs" onClick={onSave}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
