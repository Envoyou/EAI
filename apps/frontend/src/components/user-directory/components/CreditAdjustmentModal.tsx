'use client';

import {
  CreditCard,
  PlusCircle,
  MinusCircle,
  X,
  Loader2,
} from 'lucide-react';
import type { DirectoryUser } from '../types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface CreditAdjustmentModalProps {
  selectedUser: DirectoryUser;
  adjustDirection: 'add' | 'deduct';
  setAdjustDirection: (dir: 'add' | 'deduct') => void;
  adjustAmount: number | '';
  setAdjustAmount: (val: number | '') => void;
  adjustReason: string;
  setAdjustReason: (val: string) => void;
  adjustTicket: string;
  setAdjustTicket: (val: string) => void;
  adjustIdempotency: string;
  submittingAdjustment: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CreditAdjustmentModal({
  selectedUser,
  adjustDirection,
  setAdjustDirection,
  adjustAmount,
  setAdjustAmount,
  adjustReason,
  setAdjustReason,
  adjustTicket,
  setAdjustTicket,
  adjustIdempotency,
  submittingAdjustment,
  onClose,
  onSubmit,
}: CreditAdjustmentModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded-lg transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">Adjust User Credits</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {selectedUser.name || selectedUser.email}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase block mb-1.5">
              Adjustment Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjustDirection('add')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  adjustDirection === 'add'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                    : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <PlusCircle className="h-4 w-4" />
                <span>Add Credits</span>
              </button>
              <button
                type="button"
                onClick={() => setAdjustDirection('deduct')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  adjustDirection === 'deduct'
                    ? 'bg-red-500/10 border-red-500/40 text-red-500'
                    : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <MinusCircle className="h-4 w-4" />
                <span>Deduct Credits</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase block mb-1">
              Credit Amount
            </label>
            <Input
              variant="surface"
              type="number"
              min="1"
              max="1000000"
              placeholder="e.g. 100"
              value={adjustAmount}
              onChange={(e) =>
                setAdjustAmount(e.target.value ? Number(e.target.value) : '')
              }
              className="font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase block mb-1">
              Reason / Justification
            </label>
            <Textarea
              variant="surface"
              rows={3}
              placeholder="Detail the justification for this credit adjustment..."
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              className="resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase block mb-1">
              Ticket Reference
            </label>
            <Input
              variant="surface"
              type="text"
              placeholder="e.g. ZOHO-10294 or INC-8291"
              value={adjustTicket}
              onChange={(e) => setAdjustTicket(e.target.value)}
              className="font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase block mb-1">
              Idempotency Key
            </label>
            <Input
              variant="surface"
              type="text"
              readOnly
              value={adjustIdempotency}
              className="bg-[var(--surface-3)] text-xs text-[var(--muted-foreground)] font-mono select-all"
            />
          </div>

          <div className="flex items-center justify-end gap-2 mt-2">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submittingAdjustment}
              variant="primary"
              size="sm"
              className="flex items-center gap-1.5"
            >
              {submittingAdjustment && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Submit Adjustment</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
