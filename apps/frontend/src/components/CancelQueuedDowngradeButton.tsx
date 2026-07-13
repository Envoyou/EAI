'use client';

import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
import { X, AlertTriangle } from 'lucide-react';
import { getApiUrl } from '@/lib/api-url';

export default function CancelQueuedDowngradeButton() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleCancelDowngrade = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/payments/queued-downgrade`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to cancel scheduled downgrade');
      }

      toast.success('Scheduled downgrade cancelled. Your yearly subscription continues.');
      setConfirming(false);
      
      // Reload the page to reflect updated subscription status
      window.location.reload();
    } catch (error: unknown) {
      console.error('Error cancelling scheduled downgrade:', error);
      const message = error instanceof Error ? error.message : 'An error occurred while cancelling your scheduled downgrade.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="ui-btn ui-btn-outline ui-btn-sm text-foreground hover:bg-[var(--surface-3)]"
      >
        Keep My Current Plan
      </button>

      {confirming && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setConfirming(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface-1)] border border-[var(--border)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-foreground">Cancel Downgrade</h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                aria-label="Close cancel confirmation"
                className="rounded-full p-1.5 text-muted-foreground transition hover:bg-[var(--surface-2)] hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Are you sure you want to cancel the scheduled downgrade? Your current yearly plan will remain active and continue to renew normally at the end of the term.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="ui-btn ui-btn-surface ui-btn-sm"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancelDowngrade}
                disabled={loading}
                className="ui-btn ui-btn-primary ui-btn-sm"
              >
                {loading ? 'Cancelling...' : 'Confirm Keep Current Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
