'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
import { X, CheckCircle } from 'lucide-react';
import { getApiUrl } from '@/lib/api-url';
import { Button } from '@/components/ui/button';

export default function ReactivateSubscriptionButton() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleReactivateSubscription = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const apiUrl = getApiUrl();
      const response = await fetchWithTimeout(`${apiUrl}/api/payments/reactivate-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to reactivate subscription');
      }

      toast.success('Subscription successfully reactivated.');
      setConfirming(false);
      
      // Reload the page to reflect updated subscription status
      window.location.reload();
    } catch (error: unknown) {
      console.error('Error reactivating subscription:', error);
      const message = error instanceof Error ? error.message : 'An error occurred while reactivating your subscription.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setConfirming(true)}
        variant="primary"
        size="sm"
      >
        Reactivate Subscription
      </Button>

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
                <CheckCircle className="h-5 w-5" />
                <h2 className="text-lg font-bold text-foreground">Resume Plan</h2>
              </div>
              <Button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                aria-label="Close reactivation confirmation"
                variant="muted"
                size="icon-xs"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Would you like to resume your subscription plan? Your subscription status will return to active, and billing/credits will continue normally.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={loading}
                variant="surface"
                size="sm"
              >
                Keep Canceled
              </Button>
              <Button
                type="button"
                onClick={handleReactivateSubscription}
                disabled={loading}
                variant="primary"
                size="sm"
              >
                {loading ? 'Reactivating...' : 'Confirm Reactivate'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
