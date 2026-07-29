'use client';

import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { fetchWithTimeout } from '@/lib/fetch-utils';

import {
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  MinusCircle,
  PlusCircle,
  Search,
  ShieldCheck,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type Balance = {
  total: number;
  trial: number;
  subscription: number;
  addon: number;
};

type Member = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

type Subscription = {
  plan: string;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd: string;
  cancelReason?: string | null;
  cancelFeedback?: string | null;
} | null;

type OrganizationSummary = {
  id: string;
  clerkOrganizationId: string | null;
  name: string;
  publicationName: string | null;
  slug: string;
  domain: string | null;
  users: Member[];
  subscription: Subscription;
  balance: Balance;
};

type LedgerEntry = {
  id: string;
  type: string;
  bucket: string;
  amount: number;
  idempotencyKey: string | null;
  description: string | null;
  adjustmentReason: string | null;
  adjustmentGroupKey: string | null;
  ticketReference: string | null;
  externalTicketId: string | null;
  externalTicketUrl: string | null;
  performedByUserId: string | null;
  performedByEmail: string | null;
  createdAt: string;
};

type OrganizationDetail = OrganizationSummary & {
  createdAt: string;
  transactions: LedgerEntry[];
};

type PendingAdjustment = {
  direction: 'add' | 'deduct';
  amount: number;
  reason: string;
  ticketReference: string;
  idempotencyKey: string;
};

type ZohoTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  email: string | null;
  contactName: string | null;
  url: string | null;
};

const formatCredits = (value: number) => value.toLocaleString('en-US');
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const planLabel = (subscription: Subscription) => {
  if (!subscription || (subscription.status !== 'active' && subscription.status !== 'cancels_at_period_end')) return 'Free';
  return subscription.plan.replaceAll('_', ' ');
};

export function BillingAdmin({ zohoDeskEnabled }: { zohoDeskEnabled: boolean }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OrganizationSummary[]>([]);
  const [selected, setSelected] = useState<OrganizationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [ticketReference, setTicketReference] = useState('');
  const [verifiedTicket, setVerifiedTicket] = useState<ZohoTicket | null>(null);
  const [verifyingTicket, setVerifyingTicket] = useState(false);
  const [pending, setPending] = useState<PendingAdjustment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'credits' | 'plan'>('credits');
  const [overridePlan, setOverridePlan] = useState('pro');
  const [overrideDurationDays, setOverrideDurationDays] = useState('30');
  const [pendingOverride, setPendingOverride] = useState<{
    plan: string;
    durationDays: number;
    reason: string;
    ticketReference: string;
  } | null>(null);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      toast.error('Enter at least two characters.');
      return;
    }

    setSearching(true);
    try {
      const response = await fetchWithTimeout(`/api/admin/billing?q=${encodeURIComponent(cleanQuery)}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed.');
      setResults(data.organizations || []);
      if ((data.organizations || []).length === 0) {
        toast.info('No active organization matched that search.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const loadOrganization = async (organizationId: string) => {
    setLoadingDetail(true);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/billing?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load workspace.');
      setSelected(data.organization);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load workspace.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const prepareAdjustment = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    const numericAmount = Number(amount);
    if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
      toast.error('Credit amount must be a positive whole number.');
      return;
    }
    if (direction === 'deduct' && numericAmount > selected.balance.total) {
      toast.error(`The maximum deduction is ${formatCredits(selected.balance.total)} credits.`);
      return;
    }
    if (reason.trim().length < 5 || ticketReference.trim().length < 2) {
      toast.error('Provide a clear reason and ticket reference.');
      return;
    }
    if (zohoDeskEnabled && !verifiedTicket) {
      toast.error('Verify the Zoho Desk ticket before reviewing this adjustment.');
      return;
    }

    setPending({
      direction,
      amount: numericAmount,
      reason: reason.trim(),
      ticketReference: ticketReference.trim(),
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const verifyTicket = async () => {
    const reference = ticketReference.trim();
    if (!reference) {
      toast.error('Enter a Zoho Desk ticket number or ID.');
      return;
    }

    setVerifyingTicket(true);
    setVerifiedTicket(null);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/billing/ticket?reference=${encodeURIComponent(reference)}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ticket verification failed.');
      setVerifiedTicket(data.ticket);
      setTicketReference(data.ticket.ticketNumber);
      toast.success(`Zoho Desk ticket #${data.ticket.ticketNumber} verified.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ticket verification failed.');
    } finally {
      setVerifyingTicket(false);
    }
  };

  const executeAdjustment = async () => {
    if (!selected || !pending || submitting) return;
    setSubmitting(true);

    try {
      const response = await fetchWithTimeout('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selected.id,
          ...pending,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Credit adjustment failed.');

      setSelected(data.organization);
      setResults((current) => current.map((organization) =>
        organization.id === selected.id
          ? { ...organization, balance: data.organization.balance }
          : organization
      ));
      setAmount('');
      setReason('');
      setTicketReference('');
      setVerifiedTicket(null);
      setPending(null);
      toast.success(
        data.duplicate
          ? 'This adjustment was already applied. No duplicate transaction was created.'
          : `${pending.direction === 'add' ? 'Added' : 'Deducted'} ${formatCredits(pending.amount)} credits.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Credit adjustment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const prepareOverride = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    if (zohoDeskEnabled && !verifiedTicket) {
      toast.error('Verify the Zoho Desk ticket before reviewing this plan override.');
      return;
    }

    const duration = parseInt(overrideDurationDays, 10);
    if (isNaN(duration) || duration <= 0) {
      toast.error('Duration must be a positive integer.');
      return;
    }

    setPendingOverride({
      plan: overridePlan,
      durationDays: duration,
      reason: reason.trim(),
      ticketReference: ticketReference.trim(),
    });
  };

  const executeOverride = async () => {
    if (!selected || !pendingOverride || submitting) return;
    setSubmitting(true);

    try {
      const response = await fetchWithTimeout('/api/admin/billing/override-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selected.id,
          ...pendingOverride,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Plan override failed.');

      setSelected(data.organization);
      setResults((current) => current.map((organization) =>
        organization.id === selected.id
          ? { ...organization, balance: data.organization.balance, subscription: data.organization.subscription }
          : organization
      ));
      setReason('');
      setTicketReference('');
      setVerifiedTicket(null);
      setPendingOverride(null);
      toast.success(`Plan overridden to ${overridePlan.replaceAll('_', ' ')} successfully.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Plan override failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="text-[var(--foreground)] pb-12">

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-6">
        <aside className="space-y-4">
          <form onSubmit={runSearch} className="ui-card p-4">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Find workspace
            </label>
            <div className="mt-3 flex gap-2">
              <Input
                variant="surface"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Email, organization, slug..."
                aria-label="Search email or organization"
              />
              <Button
                type="submit"
                disabled={searching}
                variant="primary"
                size="sm"
                className="shrink-0"
              >
                {searching
                  ? <EAILoaderStatusIcon className="h-4 w-4" />
                  : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
          </form>

          {results.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((organization) => (
                <Button
                  key={organization.id}
                  type="button"
                  onClick={() => loadOrganization(organization.id)}
                  variant="ghost"
                  className={`ui-card ui-card-hover w-full p-4 text-left justify-start flex-col items-stretch h-auto border-none ${
                    selected?.id === organization.id ? 'ring-2 ring-[var(--primary)]/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{organization.name}</p>
                      <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                        {organization.users[0]?.email || organization.slug}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-[var(--primary)]">
                      {formatCredits(organization.balance.total)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                    <span>{planLabel(organization.subscription)}</span>
                    <span>{organization.users.length} member{organization.users.length === 1 ? '' : 's'}</span>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {loadingDetail ? (
            <div className="ui-card flex min-h-96 items-center justify-center">
              <EAILoaderStatusIcon className="h-7 w-7 text-[var(--primary)]" />
            </div>
          ) : !selected ? (
            <div className="ui-card flex min-h-96 flex-col items-center justify-center px-6 text-center">
              <Building2 className="h-10 w-10 text-[var(--primary)]" />
              <h2 className="mt-4 text-lg font-bold">Select an organization</h2>
              <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
                Search by customer email or organization name to review its plan, balance,
                transaction history, and audit records.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Workspace Details + Manual Adjustment Form Split Layout */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left side: Workspace details, Available Credits, and Summary Cards (2/3 width on desktop) */}
                <div className="ui-card flex flex-col justify-between p-5 lg:col-span-2">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {/* Workspace Identity Details */}
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-2xl font-bold">{selected.name}</h2>
                        <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">
                          {selected.id}
                        </p>
                        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                          {selected.publicationName || selected.domain || selected.slug}
                        </p>
                      </div>

                      {(selected.subscription?.cancelReason || selected.subscription?.cancelFeedback) && (
                        <div className="rounded-2xl border border-red-200 dark:border-red-950 bg-red-500/5 p-4 text-xs space-y-2 text-left">
                          <h4 className="font-bold text-red-600 dark:text-red-400 uppercase tracking-wider !text-[10px]">
                            Churn Survey Feedback
                          </h4>
                          {selected.subscription.cancelReason && (
                            <p className="text-[var(--foreground)]">
                              <span className="font-semibold text-[var(--muted-foreground)]">Reason:</span>{' '}
                              {selected.subscription.cancelReason}
                            </p>
                          )}
                          {selected.subscription.cancelFeedback && (
                            <p className="text-[var(--foreground)]">
                              <span className="font-semibold text-[var(--muted-foreground)]">Message:</span>{' '}
                              &ldquo;{selected.subscription.cancelFeedback}&rdquo;
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Workspace Members list */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-3 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-[var(--primary)]" />
                        Workspace Members ({selected.users.length})
                      </h4>
                      <div className="space-y-2.5 max-h-32 overflow-y-auto pr-1">
                        {selected.users.map((user) => (
                          <div key={user.id} className="flex items-center justify-between gap-3 text-xs border-b border-[var(--border)]/50 pb-2 last:border-0 last:pb-0">
                            <div className="min-w-0">
                              <p className="font-semibold truncate text-[var(--foreground)]">{user.name || 'No Name'}</p>
                              <p className="text-[10px] text-[var(--muted-foreground)] truncate">{user.email}</p>
                            </div>
                            <Badge variant="surface" className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                              {user.role}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-5 border-t border-[var(--border)] pt-5 md:flex-row md:items-center md:justify-between">
                    <div className="ui-card-soft px-5 py-3 shrink-0 text-left">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                        Available credits
                      </p>
                      <p className="mt-1 text-3xl font-black text-[var(--primary)]">
                        {formatCredits(selected.balance.total)}
                      </p>
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-2 xl:grid-cols-4">
                      <SummaryCard
                        icon={<CreditCard className="h-4 w-4" />}
                        label="Plan"
                        value={planLabel(selected.subscription)}
                      />
                      <SummaryCard
                        icon={<PlusCircle className="h-4 w-4" />}
                        label="Add-on"
                        value={formatCredits(selected.balance.addon)}
                      />
                      <SummaryCard
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        label="Subscription"
                        value={formatCredits(selected.balance.subscription)}
                      />
                      <SummaryCard
                        icon={<Users className="h-4 w-4" />}
                        label="Members"
                        value={String(selected.users.length)}
                      />
                    </div>
                  </div>
                </div>

                {/* Right side: Tabbed Panel for Manual Adjustment & Plan Override (1/3 width on desktop) */}
                <div className="ui-card flex flex-col justify-between p-5">
                  <div className="flex-1 flex flex-col">
                    {/* Tab Switcher */}
                    <div className="flex border-b border-[var(--border)] mb-4">
                      <Button
                        type="button"
                        onClick={() => setActiveTab('credits')}
                        variant="ghost"
                        className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 text-center rounded-none h-auto -mb-px border-none ${
                          activeTab === 'credits'
                            ? 'border-[var(--primary)] text-[var(--foreground)] border-b-2'
                            : 'border-transparent text-[var(--muted-foreground)]'
                        }`}
                      >
                        Adjust Credits
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setActiveTab('plan')}
                        variant="ghost"
                        className={`flex-1 pb-2 text-xs font-bold transition-all border-b-2 text-center rounded-none h-auto -mb-px border-none ${
                          activeTab === 'plan'
                            ? 'border-[var(--primary)] text-[var(--foreground)] border-b-2'
                            : 'border-transparent text-[var(--muted-foreground)]'
                        }`}
                      >
                        Override Plan
                      </Button>
                    </div>

                    {activeTab === 'credits' ? (
                      <form onSubmit={prepareAdjustment} className="flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="font-bold text-sm">Manual adjustment</h3>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)] mb-3">
                            Recorded as a `manual_adjustment` ledger entry.
                          </p>

                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              onClick={() => setDirection('add')}
                              variant={direction === 'add' ? 'primary' : 'surface'}
                              size="sm"
                              aria-pressed={direction === 'add'}
                            >
                              <PlusCircle className="h-4 w-4" />
                              Add
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setDirection('deduct')}
                              variant={direction === 'deduct' ? 'danger' : 'surface'}
                              size="sm"
                              aria-pressed={direction === 'deduct'}
                            >
                              <MinusCircle className="h-4 w-4" />
                              Deduct
                            </Button>
                          </div>

                          <label className="mt-3 block text-xs font-semibold">
                            Amount
                            <Input
                              variant="surface"
                              type="number"
                              min="1"
                              max="1000000"
                              step="1"
                              value={amount}
                              onChange={(event) => setAmount(event.target.value)}
                              className="mt-1.5"
                              placeholder="100"
                              required
                            />
                          </label>

                          <label className="mt-3 block text-xs font-semibold">
                            Reason
                            <Textarea
                              variant="surface"
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                              className="mt-1.5 h-16 resize-none"
                              placeholder="Customer support correction..."
                              required
                            />
                          </label>

                          <label className="mt-3 block text-xs font-semibold">
                            {zohoDeskEnabled ? 'Zoho Desk ticket' : 'Ticket reference'}
                            <div className="mt-1.5 flex gap-2">
                              <div className="relative min-w-0 flex-1">
                                <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                                <Input
                                  variant="surface"
                                  value={ticketReference}
                                  onChange={(event) => {
                                    setTicketReference(event.target.value);
                                    setVerifiedTicket(null);
                                  }}
                                  className="!pl-10 font-mono"
                                  placeholder={zohoDeskEnabled ? '1024 or ticket ID' : 'SUP-1024'}
                                  required
                                />
                              </div>
                              {zohoDeskEnabled && (
                                <Button
                                  type="button"
                                  onClick={verifyTicket}
                                  disabled={verifyingTicket || !ticketReference.trim()}
                                  variant="surface"
                                  size="sm"
                                  className="shrink-0"
                                >
                                  {verifyingTicket
                                    ? <EAILoaderStatusIcon className="h-4 w-4" />
                                    : <ShieldCheck className="h-4 w-4" />}
                                  Verify
                                </Button>
                              )}
                            </div>
                          </label>

                          {zohoDeskEnabled && verifiedTicket && (
                            <div className="mt-3 rounded-2xl bg-emerald-500/10 p-3 text-xs ring-1 ring-emerald-500/20">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-bold text-emerald-700 dark:text-emerald-300">
                                    Ticket #{verifiedTicket.ticketNumber} verified
                                  </p>
                                  <p className="mt-1 truncate font-semibold">{verifiedTicket.subject}</p>
                                  <p className="mt-1 text-[var(--muted-foreground)]">
                                    {[verifiedTicket.contactName, verifiedTicket.email, verifiedTicket.status]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                </div>
                                {verifiedTicket.url && (
                                  <Button
                                    render={<a href={verifiedTicket.url} target="_blank" rel="noreferrer" />}
                                    variant="muted"
                                    size="icon"
                                    className="shrink-0"
                                    aria-label="Open ticket in Zoho Desk"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <Button
                          type="submit"
                          variant={direction === 'add' ? 'primary' : 'outline'}
                          className="mt-5 w-full"
                        >
                          {direction === 'add' ? <PlusCircle className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
                          Review {direction === 'add' ? 'addition' : 'deduction'}
                        </Button>
                      </form>
                    ) : (
                      <form onSubmit={prepareOverride} className="flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="font-bold text-sm">Override Plan</h3>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)] mb-3">
                            Manually change subscription package and reset credits.
                          </p>

                          <label className="block text-xs font-semibold">
                            Select Plan
                            <div className="mt-1.5">
                              <Select
                                value={overridePlan}
                                onValueChange={(val) => {
                                  if (val !== null) setOverridePlan(val);
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="starter">Starter (50 credits/mo)</SelectItem>
                                  <SelectItem value="starter_yearly">Starter Yearly (50 credits/mo)</SelectItem>
                                  <SelectItem value="pro">Pro (100 credits/mo)</SelectItem>
                                  <SelectItem value="pro_yearly">Pro Yearly (100 credits/mo)</SelectItem>
                                  <SelectItem value="team">Team (300 credits/mo)</SelectItem>
                                  <SelectItem value="team_yearly">Team Yearly (300 credits/mo)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </label>

                          <label className="mt-3 block text-xs font-semibold">
                            Duration (Days)
                            <Input
                              variant="surface"
                              type="number"
                              min="1"
                              max="3650"
                              step="1"
                              value={overrideDurationDays}
                              onChange={(event) => setOverrideDurationDays(event.target.value)}
                              className="mt-1.5"
                              placeholder="30"
                              required
                            />
                          </label>

                          <label className="mt-3 block text-xs font-semibold">
                            Reason
                            <Textarea
                              variant="surface"
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                              className="mt-1.5 h-16 resize-none"
                              placeholder="Enterprise manual contract..."
                              required
                            />
                          </label>

                          <label className="mt-3 block text-xs font-semibold">
                            {zohoDeskEnabled ? 'Zoho Desk ticket' : 'Ticket reference'}
                            <div className="mt-1.5 flex gap-2">
                              <div className="relative min-w-0 flex-1">
                                <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                                <Input
                                  variant="surface"
                                  value={ticketReference}
                                  onChange={(event) => {
                                    setTicketReference(event.target.value);
                                    setVerifiedTicket(null);
                                  }}
                                  className="!pl-10 font-mono"
                                  placeholder={zohoDeskEnabled ? '1024 or ticket ID' : 'SUP-1024'}
                                  required
                                />
                              </div>
                              {zohoDeskEnabled && (
                                <Button
                                  type="button"
                                  onClick={verifyTicket}
                                  disabled={verifyingTicket || !ticketReference.trim()}
                                  variant="surface"
                                  size="sm"
                                  className="shrink-0"
                                >
                                  {verifyingTicket
                                    ? <EAILoaderStatusIcon className="h-4 w-4" />
                                    : <ShieldCheck className="h-4 w-4" />}
                                  Verify
                                </Button>
                              )}
                            </div>
                          </label>

                          {zohoDeskEnabled && verifiedTicket && (
                            <div className="mt-3 rounded-2xl bg-emerald-500/10 p-3 text-xs ring-1 ring-emerald-500/20">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-bold text-emerald-700 dark:text-emerald-300">
                                    Ticket #{verifiedTicket.ticketNumber} verified
                                  </p>
                                  <p className="mt-1 truncate font-semibold">{verifiedTicket.subject}</p>
                                  <p className="mt-1 text-[var(--muted-foreground)]">
                                    {[verifiedTicket.contactName, verifiedTicket.email, verifiedTicket.status]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                </div>
                                {verifiedTicket.url && (
                                  <Button
                                    render={<a href={verifiedTicket.url} target="_blank" rel="noreferrer" />}
                                    variant="muted"
                                    size="icon"
                                    className="shrink-0"
                                    aria-label="Open ticket in Zoho Desk"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <Button
                          type="submit"
                          variant="primary"
                          className="mt-5 w-full"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Review plan override
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </div>

              {/* Unified Credit Transaction & Audit History */}
              <div className="ui-card overflow-hidden">
                <div className="border-b border-[var(--border)] px-5 py-4">
                  <h3 className="font-bold">Credit Transaction & Audit History</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    All ledger entries, credit adjustments, and purchases recorded for this workspace.
                  </p>
                </div>
                <div className="px-5 pt-2 text-[9px] text-[var(--muted-foreground)] sm:hidden select-none">
                  Swipe horizontally to view all columns
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Event</th>
                        <th className="px-4 py-3">Bucket</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Description / Reason</th>
                        <th className="px-4 py-3">Ticket</th>
                        <th className="px-4 py-3">Performed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {selected.transactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-[var(--surface-2)] transition-colors">
                          <td className="whitespace-nowrap px-4 py-4 text-[var(--muted-foreground)] tabular-nums">
                            {formatDate(transaction.createdAt)}
                          </td>
                          <td className="px-4 py-4 font-semibold capitalize text-[var(--foreground)]">
                            {transaction.type.replaceAll('_', ' ')}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <Badge variant="surface" className="text-[9px] font-semibold capitalize tracking-wider">
                              {transaction.bucket}
                            </Badge>
                          </td>
                          <td className={`whitespace-nowrap px-4 py-4 text-right font-mono font-bold text-sm ${
                            transaction.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}>
                            {transaction.amount >= 0 ? '+' : ''}
                            {formatCredits(transaction.amount)}
                          </td>
                          <td className="max-w-xs px-4 py-4 text-[var(--foreground)] break-words font-medium">
                            {transaction.adjustmentReason || transaction.description || '-'}
                          </td>
                          <td className="px-4 py-4 font-mono">
                            {transaction.externalTicketUrl ? (
                              <a
                                href={transaction.externalTicketUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline font-semibold"
                              >
                                #{transaction.ticketReference}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : transaction.ticketReference ? (
                              <span className="text-[var(--foreground)] font-medium">#{transaction.ticketReference}</span>
                            ) : (
                              <span className="text-[var(--muted-foreground)]">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-[var(--muted-foreground)]">
                            {transaction.performedByEmail ? (
                              <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center text-[9px] font-bold uppercase">
                                  {transaction.performedByEmail.slice(0, 2)}
                                </div>
                                <span className="text-[11px] font-medium">{transaction.performedByEmail}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-[var(--muted-foreground)]">System</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {selected.transactions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-[var(--muted-foreground)]">
                            No credit transactions or audit records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {pending && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="ui-card w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Confirm credit adjustment</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  This creates an immutable ledger transaction.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setPending(null)}
                disabled={submitting}
                variant="muted"
                size="icon"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <dl className="mt-5 grid grid-cols-[140px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
              <dt className="text-[var(--muted-foreground)]">Workspace</dt>
              <dd className="font-semibold">{selected.name}</dd>
              <dt className="text-[var(--muted-foreground)]">Action</dt>
              <dd className="font-semibold capitalize">{pending.direction}</dd>
              <dt className="text-[var(--muted-foreground)]">Amount</dt>
              <dd className="font-mono font-bold">{formatCredits(pending.amount)} credits</dd>
              <dt className="text-[var(--muted-foreground)]">Resulting balance</dt>
              <dd className="font-mono font-bold">
                {formatCredits(
                  selected.balance.total + (pending.direction === 'add' ? pending.amount : -pending.amount)
                )}
              </dd>
              <dt className="text-[var(--muted-foreground)]">Ticket</dt>
              <dd>
                <span className="font-mono">#{pending.ticketReference}</span>
                {verifiedTicket && (
                  <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                    {verifiedTicket.subject}
                  </span>
                )}
              </dd>
              <dt className="text-[var(--muted-foreground)]">Reason</dt>
              <dd>{pending.reason}</dd>
              <dt className="text-[var(--muted-foreground)]">Idempotency key</dt>
              <dd className="break-all font-mono text-xs">{pending.idempotencyKey}</dd>
            </dl>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setPending(null)}
                disabled={submitting}
                variant="surface"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={executeAdjustment}
                disabled={submitting}
                variant={pending.direction === 'add' ? 'primary' : 'danger'}
              >
                {submitting && <EAILoaderStatusIcon className="h-4 w-4" />}
                Confirm {pending.direction}
              </Button>
            </div>
          </div>
        </div>
      )}
      {pendingOverride && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="ui-card w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Confirm plan override</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  This manually overrides the organization&apos;s subscription package.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setPendingOverride(null)}
                disabled={submitting}
                variant="muted"
                size="icon"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <dl className="mt-5 grid grid-cols-[140px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
              <dt className="text-[var(--muted-foreground)]">Workspace</dt>
              <dd className="font-semibold">{selected.name}</dd>
              <dt className="text-[var(--muted-foreground)]">Target plan</dt>
              <dd className="font-bold text-[var(--primary)] capitalize">
                {pendingOverride.plan.replaceAll('_', ' ')}
              </dd>
              <dt className="text-[var(--muted-foreground)]">Duration</dt>
              <dd className="font-semibold">{pendingOverride.durationDays} Days</dd>
              <dt className="text-[var(--muted-foreground)]">Ticket</dt>
              <dd>
                <span className="font-mono">#{pendingOverride.ticketReference}</span>
                {verifiedTicket && (
                  <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                    {verifiedTicket.subject}
                  </span>
                )}
              </dd>
              <dt className="text-[var(--muted-foreground)]">Reason</dt>
              <dd>{pendingOverride.reason}</dd>
            </dl>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setPendingOverride(null)}
                disabled={submitting}
                variant="surface"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={executeOverride}
                disabled={submitting}
                variant="primary"
              >
                {submitting && <EAILoaderStatusIcon className="h-4 w-4" />}
                Confirm override
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="ui-card-soft p-3">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-bold capitalize">{value}</p>
    </div>
  );
}
