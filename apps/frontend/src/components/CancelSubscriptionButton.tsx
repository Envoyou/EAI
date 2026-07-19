'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
import { X, AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react';
import { getApiUrl } from '@/lib/api-url';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

interface CancelSubscriptionButtonProps {
  planName: string;
}

type CancelStep = 'survey' | 'confirm';

const SURVEY_OPTIONS = {
  price: {
    title: 'Price / Budget',
    options: [
      "It's too expensive.",
      "Temporary cancellation / I only needed it for a short time.",
      "Switching to a cheaper alternative."
    ]
  },
  product: {
    title: 'Product / Features',
    options: [
      "Missing features that I need.",
      "Too difficult to use / High learning curve.",
      "Technical issues / Bugs."
    ]
  },
  value: {
    title: 'Need / Value',
    options: [
      "I’m no longer doing this type of work.",
      "I didn't use the product enough.",
      "The product didn't meet my expectations."
    ]
  },
  other: {
    title: 'Other',
    options: [
      "Other (Please specify below)."
    ]
  }
};

export default function CancelSubscriptionButton({ planName }: CancelSubscriptionButtonProps) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<CancelStep>('survey');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');

  const handleReasonChange = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleCancelSubscription = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const apiUrl = getApiUrl();
      const response = await fetchWithTimeout(`${apiUrl}/api/payments/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          reasons: selectedReasons,
          feedback: feedback.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to cancel subscription');
      }

      toast.success('Subscription successfully cancelled.');
      setConfirming(false);
      
      // Reload the page to reflect updated subscription status
      window.location.reload();
    } catch (error: unknown) {
      console.error('Error cancelling subscription:', error);
      const message = error instanceof Error ? error.message : 'An error occurred while cancelling your subscription.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setConfirming(false);
    setStep('survey');
    setSelectedReasons([]);
    setFeedback('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="ui-btn ui-btn-danger ui-btn-sm"
      >
        Cancel Subscription
      </button>

      {confirming && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) resetState();
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-[var(--surface-1)] border border-[var(--border)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Step 1: Churn Survey */}
            {step === 'survey' && (
              <>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Cancel Subscription</h2>
                    <p className="text-xs text-muted-foreground mt-1">We’re sorry to see you go. What could we have done better?</p>
                  </div>
                  <button
                    type="button"
                    onClick={resetState}
                    aria-label="Close cancel confirmation"
                    className="rounded-full p-1.5 text-muted-foreground transition hover:bg-[var(--surface-2)] hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {Object.entries(SURVEY_OPTIONS).map(([key, group]) => (
                    <div key={key} className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-primary">{group.title}</h3>
                      <div className="grid gap-2">
                        {group.options.map((option) => {
                          const isChecked = selectedReasons.includes(option);
                          return (
                            <label
                              key={option}
                              className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer text-xs ${
                                isChecked
                                  ? 'bg-primary/5 border-primary/30 text-foreground'
                                  : 'bg-[var(--surface-2)] border-[var(--border)] text-muted-foreground hover:text-foreground hover:border-[var(--border-hover)]'
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleReasonChange(option)}
                                className="mt-0.5 size-3.5"
                                aria-label={option}
                              />
                              <span>{option}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="space-y-2 pt-2">
                    <label htmlFor="additional-feedback" className="text-xs font-bold text-foreground block">
                      Any additional feedback for us? (Optional)
                    </label>
                    <Textarea
                      variant="surface"
                      id="additional-feedback"
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Tell us how we can improve Envoyou..."
                      className="rounded-xl p-3 text-xs resize-none"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-[var(--border)] pt-4">
                  <button
                    type="button"
                    onClick={resetState}
                    className="ui-btn ui-btn-surface ui-btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('confirm')}
                    className="ui-btn ui-btn-primary ui-btn-sm"
                  >
                    Continue
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Destructive Confirmation */}
            {step === 'confirm' && (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2 text-rose-500">
                    <AlertTriangle className="h-5 w-5" />
                    <h2 className="text-lg font-bold text-foreground">Confirm Cancellation</h2>
                  </div>
                  <button
                    type="button"
                    onClick={resetState}
                    disabled={loading}
                    aria-label="Close cancel confirmation"
                    className="rounded-full p-1.5 text-muted-foreground transition hover:bg-[var(--surface-2)] hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 py-4 space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    Are you sure you want to cancel your <strong className="text-foreground">{planName}</strong> subscription? 
                  </p>
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs leading-5">
                    <strong>Warning:</strong> Your active subscription status will be terminated immediately. You will lose access to all remaining monthly plan credits and premium publishing features. This action cannot be undone.
                  </div>
                </div>

                <div className="mt-6 flex justify-between gap-3 border-t border-[var(--border)] pt-4">
                  <button
                    type="button"
                    onClick={() => setStep('survey')}
                    disabled={loading}
                    className="ui-btn ui-btn-surface ui-btn-sm"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    Back to Survey
                  </button>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={resetState}
                      disabled={loading}
                      className="ui-btn ui-btn-surface ui-btn-sm"
                    >
                      Keep Subscription
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelSubscription}
                      disabled={loading}
                      className="ui-btn ui-btn-danger ui-btn-sm"
                    >
                      {loading ? 'Cancelling...' : 'Confirm Cancellation'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
