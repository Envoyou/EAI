'use client';

import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function cleanUniqueList(values: string[] = []) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

export function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="mb-2 block">
      <span className="text-xs font-semibold tracking-wide text-foreground">{children}</span>
      {hint && <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ArrayField({
  label,
  hint,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const updateItem = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };

  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="group flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/20 font-mono text-[10px] text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>
            <Input
              value={value}
              onChange={(event) => updateItem(index, event.target.value)}
              placeholder={placeholder}
              className="h-9 bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              disabled={values.length === 1}
              aria-label={`Delete ${label} ${index + 1}`}
              className="text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange([...values, ''])}
          className="bg-muted/20 hover:bg-muted/40 text-muted-foreground border-transparent shadow-none"
        >
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}

export function SelectedValuesPanel({
  title,
  values,
  presetValues,
  emptyLabel,
  onRemove,
}: {
  title: string;
  values: string[];
  presetValues: string[];
  emptyLabel: string;
  onRemove: (value: string) => void;
}) {
  const presets = new Set(presetValues);
  const cleanedValues = cleanUniqueList(values);
  const customCount = cleanedValues.filter((value) => !presets.has(value)).length;

  return (
    <div className="rounded-md bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-bold text-foreground">{title}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
            {cleanedValues.length}
          </span>
        </div>
        {customCount > 0 && (
          <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-500">
            {customCount} custom
          </span>
        )}
      </div>
      {cleanedValues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {cleanedValues.map((value) => {
            const isCustom = !presets.has(value);
            return (
              <span
                key={value}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  isCustom
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                <span className="truncate">{value}</span>
                <button
                  type="button"
                  onClick={() => onRemove(value)}
                  className="rounded-full p-0.5 text-current/70 transition hover:bg-background/60 hover:text-current"
                  aria-label={`Remove ${value}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

export function AddValueControl({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();

  const handleAdd = () => {
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
  };

  return (
    <div className="mt-2 flex gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            handleAdd();
          }
        }}
        placeholder={placeholder}
        className="h-9 bg-muted/10 border-transparent hover:bg-muted/20 focus:bg-background focus:border-border transition-colors shadow-none text-xs"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={!trimmed}
        className="shrink-0"
      >
        <Plus />
        Add
      </Button>
    </div>
  );
}
