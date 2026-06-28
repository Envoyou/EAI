import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { CommandItem } from './slash-command';

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

export const CommandList = forwardRef((props: CommandListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      props.command(item);
    }
  };

  return (
    <div className="z-50 h-auto max-h-[330px] w-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2 shadow-xl transition-all">
      {props.items.length ? (
        props.items.map((item, index) => {
          const isSelected = index === selectedIndex;
          const isAiCommand = item.title.includes('(AI)');
          return (
            <button
              className={`flex w-full items-center space-x-2 rounded-md px-2 py-1.5 text-left text-sm ${
                isSelected
                  ? 'bg-[var(--surface-2)] text-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]'
              }`}
              key={index}
              onClick={() => selectItem(index)}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] ${
                  isAiCommand ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'
                }`}
              >
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className={`font-medium ${isAiCommand ? 'text-[var(--primary)]' : ''}`}>{item.title}</p>
                <p className="text-xs text-[var(--muted-foreground)]">{item.description}</p>
              </div>
            </button>
          );
        })
      ) : (
        <div className="p-4 text-center text-sm text-[var(--muted-foreground)]">No results</div>
      )}
    </div>
  );
});

CommandList.displayName = 'CommandList';
