'use client';

import { History, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { USER_ROLE_LABELS, ACQUISITION_SOURCE_LABELS, PRIMARY_GOAL_LABELS } from '@eai/shared';
import type { DirectoryUser, UserDetailsData } from '../types';
import { formatDate } from '../hooks/useUserDirectory';
import { Badge } from '@/components/ui/badge';

interface OrganizationDetailDrawerProps {
  selectedUser: DirectoryUser;
  detailsData: UserDetailsData | null;
  loadingDetails: boolean;
  activeDetailsTab: 'profile' | 'credits' | 'analyses';
  setActiveDetailsTab: (tab: 'profile' | 'credits' | 'analyses') => void;
  onClose: () => void;
}

export function OrganizationDetailDrawer({
  selectedUser,
  detailsData,
  loadingDetails,
  activeDetailsTab,
  setActiveDetailsTab,
  onClose,
}: OrganizationDetailDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-end p-0 animate-fade-in">
      <div className="bg-[var(--surface-1)] border-l border-[var(--border)] h-full max-w-xl w-full p-6 shadow-2xl flex flex-col relative overflow-y-auto">
        <Button
          type="button"
          onClick={onClose}
          variant="ghost"
          size="icon-xs"
          className="absolute right-4 top-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
            <History className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg">User Audit Details</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {selectedUser.name || selectedUser.email} ({selectedUser.id})
            </p>
          </div>
        </div>

        {/* Details Navigation Tabs */}
        <div className="flex border-b border-[var(--border)] mb-4">
          <Button
            type="button"
            onClick={() => setActiveDetailsTab('profile')}
            variant="ghost"
            className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer rounded-none h-auto -mb-px border-none ${
              activeDetailsTab === 'profile'
                ? 'border-[var(--primary)] text-[var(--primary)] border-b-2'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            Profile & Org
          </Button>
          <Button
            type="button"
            onClick={() => setActiveDetailsTab('credits')}
            variant="ghost"
            className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer rounded-none h-auto -mb-px border-none ${
              activeDetailsTab === 'credits'
                ? 'border-[var(--primary)] text-[var(--primary)] border-b-2'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            Credit Transactions
          </Button>
          <Button
            type="button"
            onClick={() => setActiveDetailsTab('analyses')}
            variant="ghost"
            className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer rounded-none h-auto -mb-px border-none ${
              activeDetailsTab === 'analyses'
                ? 'border-[var(--primary)] text-[var(--primary)] border-b-2'
                : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            Recent Analyses
          </Button>
        </div>

        {loadingDetails ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mb-2" />
            <p className="text-xs text-[var(--muted-foreground)]">Fetching audit details...</p>
          </div>
        ) : detailsData ? (
          <div className="flex-1 space-y-4">
            {activeDetailsTab === 'profile' && (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] space-y-2">
                  <h4 className="font-bold text-[var(--foreground)] uppercase text-[10px] text-[var(--muted-foreground)]">
                    Account Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[var(--muted-foreground)]">Joined:</span>{' '}
                      <span className="font-semibold">{formatDate(detailsData.user.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--muted-foreground)]">Last Sign In:</span>{' '}
                      <span className="font-semibold">
                        {detailsData.user.lastSignInAt ? formatDate(detailsData.user.lastSignInAt) : 'Never'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--muted-foreground)]">Role:</span>{' '}
                      <span className="font-semibold uppercase">{detailsData.user.role}</span>
                    </div>
                    <div>
                      <span className="text-[var(--muted-foreground)]">Current Plan:</span>{' '}
                      <span className="font-semibold">{detailsData.user.plan}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] space-y-2">
                  <h4 className="font-bold text-[var(--foreground)] uppercase text-[10px] text-[var(--muted-foreground)]">
                    Onboarding & Marketing Insights
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[var(--muted-foreground)]">Self-Reported Role:</span>{' '}
                      <span className="font-semibold">
                        {detailsData.user.onboardingRole
                          ? USER_ROLE_LABELS[detailsData.user.onboardingRole as keyof typeof USER_ROLE_LABELS] || detailsData.user.onboardingRole
                          : 'Not provided'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--muted-foreground)]">Acquisition Source:</span>{' '}
                      <span className="font-semibold">
                        {detailsData.user.organization?.acquisitionSource
                          ? ACQUISITION_SOURCE_LABELS[detailsData.user.organization.acquisitionSource as keyof typeof ACQUISITION_SOURCE_LABELS] || detailsData.user.organization.acquisitionSource
                          : 'Not provided'}
                      </span>
                    </div>
                    {detailsData.user.organization?.acquisitionSourceOther && (
                      <div className="col-span-2">
                        <span className="text-[var(--muted-foreground)]">Channel Detail:</span>{' '}
                        <span className="font-semibold text-[var(--primary)] font-mono">{detailsData.user.organization.acquisitionSourceOther}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[var(--muted-foreground)]">Primary Goal:</span>{' '}
                      <span className="font-semibold">
                        {detailsData.user.organization?.primaryGoal
                          ? PRIMARY_GOAL_LABELS[detailsData.user.organization.primaryGoal] || detailsData.user.organization.primaryGoal
                          : 'Not provided'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--muted-foreground)]">Activated At:</span>{' '}
                      <span className="font-semibold">
                        {detailsData.user.organization?.onboardingCompletedAt
                          ? formatDate(detailsData.user.organization.onboardingCompletedAt)
                          : 'Not completed / Skipped'}
                      </span>
                    </div>
                  </div>
                </div>

                {detailsData.user.organization && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] space-y-2">
                    <h4 className="font-bold text-[var(--foreground)] uppercase text-[10px] text-[var(--muted-foreground)]">
                      Organization Details
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[var(--muted-foreground)]">Org Name:</span>{' '}
                        <span className="font-semibold">{detailsData.user.organization.name}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted-foreground)]">Slug:</span>{' '}
                        <span className="font-semibold font-mono">{detailsData.user.organization.slug}</span>
                      </div>
                      {detailsData.user.organization.publicationName && (
                        <div>
                          <span className="text-[var(--muted-foreground)]">Publication Name:</span>{' '}
                          <span className="font-semibold">{detailsData.user.organization.publicationName}</span>
                        </div>
                      )}
                      {detailsData.user.organization.domain && (
                        <div>
                          <span className="text-[var(--muted-foreground)]">Domain / Website:</span>{' '}
                          <span className="font-semibold font-mono">{detailsData.user.organization.domain}</span>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-[var(--muted-foreground)]">Org ID:</span>{' '}
                        <span className="font-mono text-[11px] select-all">{detailsData.user.organization.id}</span>
                      </div>
                    </div>
                  </div>
                )}

                {detailsData.activeSubscription && (
                  <div className="p-3 rounded-lg border border-[var(--success)]/20 bg-[var(--success)]/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[var(--success)] uppercase text-[10px]">
                        Active Subscription
                      </h4>
                      <Badge variant="success" className="text-[10px] font-bold uppercase">
                        {detailsData.activeSubscription.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[var(--muted-foreground)]">Plan:</span>{' '}
                        <span className="font-semibold">{detailsData.activeSubscription.plan}</span>
                      </div>
                      <div>
                        <span className="text-[var(--muted-foreground)]">Period End:</span>{' '}
                        <span className="font-semibold">
                          {formatDate(detailsData.activeSubscription.currentPeriodEnd)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeDetailsTab === 'credits' && (
              <div className="space-y-2">
                <h4 className="font-bold text-[10px] uppercase text-[var(--muted-foreground)] mb-2">
                  Credit Transactions History
                </h4>
                {detailsData.transactions.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] py-4 text-center">
                    No transactions recorded for this user/org.
                  </p>
                ) : (
                  detailsData.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold flex items-center gap-1.5">
                          <span
                          className={tx.amount > 0 ? 'text-[var(--success)] font-bold' : 'text-[var(--destructive)] font-bold'}
                          >
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount} credits
                          </span>
                          <span className="text-[10px] text-[var(--muted-foreground)] font-mono uppercase bg-[var(--surface-3)] px-1.5 py-0.5 rounded">
                            {tx.bucket}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{tx.reason || 'No reason provided'}</p>
                      </div>
                      <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                        {formatDate(tx.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeDetailsTab === 'analyses' && (
              <div className="space-y-2">
                <h4 className="font-bold text-[10px] uppercase text-[var(--muted-foreground)] mb-2">
                  Recent Analysis Log History
                </h4>
                {detailsData.analysisLogs.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] py-4 text-center">
                    No analyses recorded.
                  </p>
                ) : (
                  detailsData.analysisLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          <span className="uppercase text-[10px] bg-[var(--surface-3)] px-1.5 py-0.5 rounded font-mono">
                            {log.role}
                          </span>
                          <span>Score: {log.score ?? 'N/A'}</span>
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 font-mono">{log.verdict || log.status}</p>
                      </div>
                      <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
