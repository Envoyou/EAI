'use client';

import {
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
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
  if (!subscription || subscription.status !== 'active') return 'Free';
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

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      toast.error('Enter at least two characters.');
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/admin/billing?q=${encodeURIComponent(cleanQuery)}`, {
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
      const response = await fetch(
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
      const response = await fetch(
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
      const response = await fetch('/api/admin/billing', {
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

  return (
    <div className="text-[var(--foreground)] pb-12">

      <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <form onSubmit={runSearch} className="ui-card p-4">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Find workspace
            </label>
            <div className="mt-3 flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="ui-control ui-input"
                placeholder="Email, organization, slug..."
                aria-label="Search email or organization"
              />
              <button
                type="submit"
                disabled={searching}
                className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
              >
                {searching
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {results.map((organization) => (
              <button
                key={organization.id}
                type="button"
                onClick={() => loadOrganization(organization.id)}
                className={`ui-card ui-card-hover w-full p-4 text-left ${
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
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {loadingDetail ? (
            <div className="ui-card flex min-h-96 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
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
              <div className="ui-card p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="text-2xl font-bold">{selected.name}</h2>
                    <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">
                      {selected.id}
                    </p>
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                      {selected.publicationName || selected.domain || selected.slug}
                    </p>
                  </div>
                  <div className="ui-card-soft px-5 py-3 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                      Available credits
                    </p>
                    <p className="mt-1 text-3xl font-black text-[var(--primary)]">
                      {formatCredits(selected.balance.total)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="ui-card overflow-hidden">
                  <div className="border-b border-[var(--border)] px-5 py-4">
                    <h3 className="font-bold">Transaction and audit history</h3>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      Latest 50 ledger entries for this organization
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-xs">
                      <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        <tr>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Reason</th>
                          <th className="px-4 py-3">Ticket</th>
                          <th className="px-4 py-3">Actor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {selected.transactions.map((transaction) => (
                          <tr key={transaction.id}>
                            <td className="whitespace-nowrap px-4 py-3 text-[var(--muted-foreground)]">
                              {formatDate(transaction.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold">{transaction.type.replaceAll('_', ' ')}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
                                {transaction.bucket}
                              </p>
                            </td>
                            <td className={`px-4 py-3 font-mono font-bold ${
                              transaction.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {transaction.amount >= 0 ? '+' : ''}
                              {formatCredits(transaction.amount)}
                            </td>
                            <td className="max-w-xs px-4 py-3">
                              {transaction.adjustmentReason || transaction.description || '-'}
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {transaction.externalTicketUrl ? (
                                <a
                                  href={transaction.externalTicketUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                                >
                                  #{transaction.ticketReference}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : transaction.ticketReference || '-'}
                            </td>
                            <td className="px-4 py-3">
                              {transaction.performedByEmail || 'System'}
                            </td>
                          </tr>
                        ))}
                        {selected.transactions.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                              No credit transactions recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <form onSubmit={prepareAdjustment} className="ui-card h-fit p-5">
                  <h3 className="font-bold">Manual adjustment</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Recorded as a `manual_adjustment` ledger entry.
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDirection('add')}
                      className={`ui-btn ui-btn-sm ${direction === 'add' ? 'ui-btn-primary' : 'ui-btn-surface'}`}
                    >
                      <PlusCircle className="h-4 w-4" />
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('deduct')}
                      className={`ui-btn ui-btn-sm ${direction === 'deduct' ? 'ui-btn-danger bg-rose-500/10' : 'ui-btn-surface'}`}
                    >
                      <MinusCircle className="h-4 w-4" />
                      Deduct
                    </button>
                  </div>

                  <label className="mt-4 block text-xs font-semibold">
                    Amount
                    <input
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="ui-control ui-input mt-2"
                      placeholder="100"
                      required
                    />
                  </label>

                  <label className="mt-4 block text-xs font-semibold">
                    Reason
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="ui-control ui-textarea mt-2"
                      placeholder="Customer support correction..."
                      required
                    />
                  </label>

                  <label className="mt-4 block text-xs font-semibold">
                    {zohoDeskEnabled ? 'Zoho Desk ticket' : 'Ticket reference'}
                    <div className="mt-2 flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                        <input
                          value={ticketReference}
                          onChange={(event) => {
                            setTicketReference(event.target.value);
                            setVerifiedTicket(null);
                          }}
                          className="ui-control ui-input !pl-10 font-mono"
                          placeholder={zohoDeskEnabled ? '1024 or ticket ID' : 'SUP-1024'}
                          required
                        />
                      </div>
                      {zohoDeskEnabled && (
                        <button
                          type="button"
                          onClick={verifyTicket}
                          disabled={verifyingTicket || !ticketReference.trim()}
                          className="ui-btn ui-btn-surface ui-btn-sm shrink-0"
                        >
                          {verifyingTicket
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <ShieldCheck className="h-4 w-4" />}
                          Verify
                        </button>
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
                          <a
                            href={verifiedTicket.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ui-btn ui-btn-muted ui-btn-icon shrink-0"
                            aria-label="Open ticket in Zoho Desk"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className={`ui-btn mt-5 w-full ${direction === 'add' ? 'ui-btn-primary' : 'ui-btn-danger bg-rose-500/10'}`}
                  >
                    {direction === 'add'
                      ? <PlusCircle className="h-4 w-4" />
                      : <MinusCircle className="h-4 w-4" />}
                    Review {direction === 'add' ? 'addition' : 'deduction'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>

        {selected && selected.transactions && selected.transactions.length > 0 && (
          <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-sm">
            <h3 className="text-lg font-bold">Ledger History</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)] mb-4">
              Recent 50 credit activities for this organization.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="pb-3 pr-4 font-semibold">Date</th>
                    <th className="pb-3 px-4 font-semibold">Bucket</th>
                    <th className="pb-3 px-4 font-semibold text-right">Amount</th>
                    <th className="pb-3 pl-4 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {selected.transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[var(--surface-2)]">
                      <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-[var(--muted-foreground)] text-xs">
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="ui-badge ui-badge-surface capitalize text-[10px]">
                          {tx.bucket}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold">
                        <span className={tx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </span>
                      </td>
                      <td className="py-3 pl-4">
                        <span className="font-medium text-[var(--foreground)]">{tx.description || tx.adjustmentReason || tx.type}</span>
                        {tx.performedByEmail && (
                          <span className="block text-[10px] text-[var(--muted-foreground)]">
                            by {tx.performedByEmail}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
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
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={submitting}
                className="ui-btn ui-btn-muted ui-btn-icon"
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </button>
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
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={submitting}
                className="ui-btn ui-btn-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeAdjustment}
                disabled={submitting}
                className={`ui-btn ${pending.direction === 'add' ? 'ui-btn-primary' : 'ui-btn-danger bg-rose-500/10'}`}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm {pending.direction}
              </button>
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
