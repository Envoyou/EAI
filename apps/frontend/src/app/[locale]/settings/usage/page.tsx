'use client';

import React, { useEffect, useState } from 'react';
import {
  Coins,
  Zap,
  CreditCard,
  PlusCircle,
  AlertTriangle,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
} from 'lucide-react';
import { SettingSection } from '@/components/SettingsUI';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type UsageTransaction = {
  id: string;
  createdAt: string;
  type: string;
  bucket: 'trial' | 'subscription' | 'addon';
  amount: number;
  description: string | null;
  isSystem: boolean;
  triggeredBy: {
    id: string;
    name: string;
    imageUrl: string | null;
  } | null;
};

type UsageSummary = {
  totalRemaining: number;
  trialRemaining: number;
  trialTotal: number;
  subscriptionRemaining: number;
  subscriptionTotal: number;
  addonRemaining: number;
  addonTotal: number;
};

type UsageResponse = {
  activeOrganizationId: string | null;
  summary: UsageSummary;
  nextRefillDate: string | null;
  transactions: UsageTransaction[];
};

export default function CreditUsageSettingsPage() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<'all' | 'trial' | 'subscription' | 'addon'>('all');

  const fetchUsageData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/workspace/usage');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch credit usage details:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUsageData();
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'trial':
        return 'Trial Credit Grant';
      case 'monthly_allocation':
      case 'yearly_monthly_allocation':
        return 'Monthly Allocation Refill';
      case 'addon_purchase':
        return 'Add-on Purchase';
      case 'article_refine':
        return 'Article Refinement';
      case 'copilot_chat':
        return 'Fast Chat with Search';
      case 'deep_research':
        return 'Deep Research Session';
      case 'cycle_reset':
        return 'Monthly Reset Expiry';
      case 'manual_adjustment':
        return 'Manual Allocation';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="settings-page-intro">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl w-full" />
      </div>
    );
  }

  // Filter logic
  const filteredTransactions = data?.transactions.filter((tx) => {
    const matchesSearch =
      tx.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getTransactionTypeLabel(tx.type).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBucket = selectedBucket === 'all' || tx.bucket === selectedBucket;
    return matchesSearch && matchesBucket;
  }) ?? [];

  return (
    <>
      <div className="settings-page-intro flex justify-between items-start m-0">
        <div className="min-w-0">
          <span>Workspace Settings</span>
          <h2 className="text-balance">Credit Usage & History</h2>
          <p className="text-pretty">
            Monitor your credit allocations, bucket breakdowns, and real-time usage trail.
          </p>
        </div>
        <button
          onClick={() => void fetchUsageData(true)}
          disabled={refreshing}
          className="ui-btn ui-btn-surface ui-btn-sm shrink-0 flex items-center gap-1.5"
          aria-label="Refresh credit usage logs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {data && (
        <div className="space-y-6 mt-6">
          {/* Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Available */}
            <div className="surface-card p-4 relative overflow-hidden border border-[var(--border)] rounded-2xl shadow-xs">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Available</p>
                  <h3 className="text-2xl font-extrabold tracking-tight mt-1 text-foreground">
                    {data.summary.totalRemaining.toLocaleString()}
                  </h3>
                </div>
                <div className="p-2 bg-primary/10 text-primary rounded-xl">
                  <Coins className="h-5 w-5" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Combined credit balance from all active sources.
              </p>
            </div>

            {/* Plan Credits */}
            <div className="surface-card p-4 relative overflow-hidden border border-[var(--border)] rounded-2xl shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Plan Credits</p>
                    <h3 className="text-2xl font-extrabold tracking-tight mt-1 text-foreground">
                      {data.summary.subscriptionRemaining.toLocaleString()}{' '}
                      <span className="text-xs font-normal text-muted-foreground">/ {data.summary.subscriptionTotal}</span>
                    </h3>
                  </div>
                  <div className="p-2 bg-primary/10 text-primary rounded-xl">
                    <CreditCard className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Refilled monthly. Current month package quota.
                </p>
              </div>
              {data.summary.subscriptionTotal > 0 && data.summary.subscriptionRemaining === 0 && (
                <p className="text-[10px] text-red-500 dark:text-red-400 font-bold mt-3 border-t border-[var(--border)] pt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Monthly Plan Quota Exhausted
                </p>
              )}
            </div>

            {/* Free/Trial Credits */}
            <div className="surface-card p-4 relative overflow-hidden border border-[var(--border)] rounded-2xl shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Free/Trial Credits</p>
                    <h3 className="text-2xl font-extrabold tracking-tight mt-1 text-foreground">
                      {data.summary.trialRemaining.toLocaleString()}{' '}
                      <span className="text-xs font-normal text-muted-foreground">/ {data.summary.trialTotal}</span>
                    </h3>
                  </div>
                  <div className="p-2 bg-primary/10 text-primary rounded-xl">
                    <Zap className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  One-time free credits. Always consumed first.
                </p>
              </div>
              {data.summary.trialTotal > 0 && data.summary.trialRemaining === 0 && (
                <p className="text-[10px] text-muted-foreground font-semibold mt-3 border-t border-[var(--border)] pt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-muted-foreground shrink-0" />
                  Free / Trial Credits Exhausted
                </p>
              )}
            </div>

            {/* Add-on Credits */}
            <div className="surface-card p-4 relative overflow-hidden border border-[var(--border)] rounded-2xl shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Add-on Credits</p>
                    <h3 className="text-2xl font-extrabold tracking-tight mt-1 text-foreground">
                      {data.summary.addonRemaining.toLocaleString()}{' '}
                      <span className="text-xs font-normal text-muted-foreground">/ {data.summary.addonTotal}</span>
                    </h3>
                  </div>
                  <div className="p-2 bg-primary/10 text-primary rounded-xl">
                    <PlusCircle className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Top-up packages that never expire.
                </p>
              </div>
              {data.summary.addonTotal > 0 && data.summary.addonRemaining === 0 && (
                <p className="text-[10px] text-muted-foreground font-semibold mt-3 border-t border-[var(--border)] pt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-muted-foreground shrink-0" />
                  Add-on Credits Exhausted
                </p>
              )}
            </div>
          </div>

          {/* Expiry / Refill Notice */}
          {data.summary.subscriptionTotal > 0 && data.nextRefillDate && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Next Quota Reset: {formatDate(data.nextRefillDate)}
                </h4>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed font-medium">
                  <strong>Important</strong>: Your remaining Plan Credits will expire on this date to make room for your new monthly allocation.
                  <span className="block mt-1 text-[10px] text-amber-600 dark:text-amber-500 opacity-90">
                    (Note: Purchased Add-on Credits will remain unaffected and never expire).
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Transactions List Section */}
          <SettingSection
            id="audit-trail"
            title="Credit Ledger & Audit Trail"
            description="Detailed breakdown of credit usage and refills recorded in this workspace."
          >
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search activity or logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ui-control ui-input !pl-9 w-full h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={selectedBucket}
                  onValueChange={(val) => {
                    if (val !== null) {
                      setSelectedBucket(val as 'all' | 'trial' | 'subscription' | 'addon');
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px] h-9 text-xs">
                    <SelectValue placeholder="All Buckets" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all">All Buckets</SelectItem>
                    <SelectItem value="subscription">Plan Credits</SelectItem>
                    <SelectItem value="trial">Free/Trial</SelectItem>
                    <SelectItem value="addon">Add-on Credits</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Audit Trail Table */}
            <div className="border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--surface-1)]">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-muted-foreground font-semibold">
                      <th className="p-3 w-[120px]">Time</th>
                      <th className="p-3 min-w-[180px]">Activity</th>
                      <th className="p-3 w-[100px]">Bucket</th>
                      <th className="p-3 w-[130px]">Amount</th>
                      <th className="p-3 w-[160px]">Triggered By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((tx) => {
                        const isNegative = tx.amount < 0;
                        
                        // Resolve Triggered By details based on system vs user and org context
                        let triggerName = 'System';
                        let triggerAvatar = null;

                        if (tx.isSystem) {
                          triggerName = 'System';
                        } else if (data.activeOrganizationId === null) {
                          // Personal workspace context: Human actions say "You"
                          triggerName = 'You';
                          if (tx.triggeredBy?.imageUrl) {
                            triggerAvatar = tx.triggeredBy.imageUrl;
                          }
                        } else {
                          // Organization context: Show teammate details
                          triggerName = tx.triggeredBy?.name || 'Teammate';
                          triggerAvatar = tx.triggeredBy?.imageUrl;
                        }

                        return (
                          <tr key={tx.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                            {/* Time */}
                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                              {formatDateTime(tx.createdAt)}
                            </td>

                            {/* Activity */}
                            <td className="p-3 min-w-[180px] max-w-[280px]">
                              <p className="font-semibold text-foreground truncate">
                                {getTransactionTypeLabel(tx.type)}
                              </p>
                              {tx.description && (
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={tx.description}>
                                  {tx.description}
                                </p>
                              )}
                            </td>

                            {/* Bucket */}
                            <td className="p-3 whitespace-nowrap">
                              <span className={`ui-badge ui-badge-xs uppercase tracking-wider font-extrabold ${
                                tx.bucket === 'trial'
                                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                  : tx.bucket === 'subscription'
                                    ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                                    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              }`}>
                                {tx.bucket === 'trial' ? 'Free' : tx.bucket === 'subscription' ? 'Plan' : 'Add-on'}
                              </span>
                            </td>

                            {/* Amount */}
                            <td className="p-3 whitespace-nowrap font-bold">
                              <span className={`inline-flex items-center gap-0.5 ${
                                isNegative ? 'text-red-500' : 'text-emerald-500'
                              }`}>
                                {isNegative ? (
                                  <>
                                    <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" />
                                    {tx.amount} Credits
                                  </>
                                ) : (
                                  <>
                                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                                    +{tx.amount} Credits
                                  </>
                                )}
                              </span>
                            </td>

                            {/* Triggered By */}
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {tx.isSystem ? (
                                  <div className="w-5 h-5 rounded-full bg-[var(--surface-3)] flex items-center justify-center shrink-0 border border-[var(--border)] text-[9px] font-bold text-muted-foreground">
                                    ⚙️
                                  </div>
                                ) : triggerAvatar ? (
                                  <Image
                                    src={triggerAvatar}
                                    alt={triggerName}
                                    width={20}
                                    height={20}
                                    className="w-5 h-5 rounded-full object-cover shrink-0 border border-[var(--border)]"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-[var(--surface-3)] flex items-center justify-center shrink-0 border border-[var(--border)] text-[9px] font-bold text-foreground">
                                    {triggerName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span className="font-medium text-foreground truncate max-w-[120px]" title={triggerName}>
                                  {triggerName}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground leading-5">
                          <Coins className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                          No credit transactions found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </SettingSection>
        </div>
      )}
    </>
  );
}
