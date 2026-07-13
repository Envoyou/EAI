'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  Loader2,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  MoreVertical,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  UserMinus,
  UserCheck,
  Mail,
  PlusCircle,
  MinusCircle,
  Calendar,
  X,
  CreditCard,
  History,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Menu } from '@base-ui/react/menu';

const generateIdempotencyKey = () => {
  return `adj_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
};

type DirectoryUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  imageUrl: string | null;
  trialUsed: boolean;
  plan: string;
  credits: number;
  analysesCount: number;
  isBanned: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  onboardingDraft: {
    step: string;
  } | null;
};

type PaginationMeta = {
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const getInitials = (name: string | null, email: string) => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length > 0) {
      return parts.map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    }
  }
  return email.slice(0, 2).toUpperCase();
};

export function UserDirectory() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    totalCount: 0,
    totalPages: 1,
    page: 1,
    limit: 10,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter and Query States
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // UI Interactive States
  const [activeDropdownUserId, setActiveDropdownUserId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'adjust-credits' | 'view-details' | 'ban-confirm' | 'send-invite' | null>(null);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);

  // Custom Invitation Email States
  const [inviteSubject, setInviteSubject] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Modal loaded data
  const [detailsData, setDetailsData] = useState<{
    user: DirectoryUser;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transactions: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    analysisLogs: any[];
    activeSubscription?: any;
    queuedSubscription?: any;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'profile' | 'credits' | 'analyses'>('profile');

  // Credit Adjustment Form States
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'deduct'>('add');
  const [adjustAmount, setAdjustAmount] = useState<number | ''>('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustTicket, setAdjustTicket] = useState('');
  const [adjustIdempotency, setAdjustIdempotency] = useState('');
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false);

  // Fetch Users
  const fetchUsers = () => {
    Promise.resolve().then(() => {
      setLoading(true);
    });
    const query = new URLSearchParams({
      page: page.toString(),
      limit: pagination.limit.toString(),
      search: search,
      plan: planFilter,
      status: statusFilter,
      sortBy: sortBy,
      sortOrder: sortOrder,
    });

    fetch(`/api/admin/users?${query.toString()}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load users');
        return res.json();
      })
      .then((data) => {
        setUsers(data.users || []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        toast.error('Failed to load user directory');
      });
  };

  useEffect(() => {
    fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, planFilter, statusFilter, sortBy, sortOrder]);

  // Search input handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearchInput('');
    setSearch('');
    setPlanFilter('');
    setStatusFilter('');
    setPage(1);
  };

  // Sorting Handler
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Clipboard copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
    toast.success('Copied to clipboard');
  };

  // Open Details Modal
  const openDetailsModal = async (user: DirectoryUser) => {
    setSelectedUser(user);
    setActiveModal('view-details');
    setActiveDetailsTab('profile');
    setLoadingDetails(true);
    setDetailsData(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/details`);
      if (!res.ok) throw new Error('Failed to load user details');
      const data = await res.json();
      setDetailsData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
      setActiveModal(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Open Credit Adjustment Modal
  const openAdjustCreditsModal = (user: DirectoryUser) => {
    setSelectedUser(user);
    setAdjustDirection('add');
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustTicket('');
    // Generate simple unique idempotency key
    setAdjustIdempotency(generateIdempotencyKey());
    setActiveModal('adjust-credits');
  };

  // Submit Credit Adjustment
  const handleAdjustCreditsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!adjustAmount || adjustAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (adjustReason.trim().length < 5) {
      toast.error('Reason must be at least 5 characters');
      return;
    }
    if (adjustTicket.trim().length < 2) {
      toast.error('Ticket Reference must be at least 2 characters');
      return;
    }

    setSubmittingAdjustment(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/adjust-credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: adjustDirection,
          amount: Number(adjustAmount),
          reason: adjustReason.trim(),
          ticketReference: adjustTicket.trim(),
          idempotencyKey: adjustIdempotency,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to adjust credits');

      toast.success(`Successfully adjusted credits (${adjustDirection === 'add' ? '+' : '-'}${adjustAmount})`);
      fetchUsers();
      setActiveModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmittingAdjustment(false);
    }
  };

  // Open Ban Confirmation Modal
  const openBanConfirmModal = (user: DirectoryUser) => {
    setSelectedUser(user);
    setActiveModal('ban-confirm');
  };

  // Execute Ban/Unban Toggle
  const handleToggleBan = async () => {
    if (!selectedUser) return;
    const action = selectedUser.isBanned ? 'unban' : 'ban';
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} user`);
      }
      toast.success(`User successfully ${action}ned`);
      fetchUsers();
      setActiveModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  // Trigger Custom Invite Modal
  const triggerResendInviteModal = (user: DirectoryUser) => {
    setSelectedUser(user);
    setInviteSubject('Lanjutkan Pendaftaran Anda di Envoyou AI');
    setInviteMessage(`Halo ${user.name || 'User'},\n\nSilakan klik tombol di bawah ini untuk melanjutkan pendaftaran dan masuk ke workspace Envoyou AI Anda. Kami telah menambahkan bonus 50 kredit gratis ke akun Anda untuk langsung dicoba!`);
    setActiveModal('send-invite');
  };

  // Submit Custom Invite Email
  const handleSendInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/resend-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customSubject: inviteSubject,
          customMessage: inviteMessage,
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send invitation');
      }
      toast.success('Onboarding invite email sent successfully via Envoyou');
      setActiveModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSendingInvite(false);
    }
  };

  if (error) {
    return (
      <div className="ui-alert ui-alert-danger flex flex-col items-center justify-center min-h-[300px] text-center p-6">
        <AlertCircle className="h-8 w-8 mb-3 opacity-90" />
        <p className="font-semibold">Failed to load directory</p>
        <p className="text-sm opacity-90 mt-1">{error}</p>
        <button type="button" onClick={fetchUsers} className="ui-btn ui-btn-danger mt-4 text-xs font-semibold">
          Retry Loading
        </button>
      </div>
    );
  }

  // Calculate user numbering bounds
  const startNum = (page - 1) * pagination.limit + 1;
  const endNum = Math.min(page * pagination.limit, pagination.totalCount);

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Filter Header Panel */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Search by Name, Email, User ID, or Org Slug..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-sm focus:outline-none focus:border-indigo-500 text-[var(--foreground)] placeholder-[var(--muted-foreground)]"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filter by Plan */}
            <Select
              value={planFilter || 'all'}
              onValueChange={(val) => {
                setPlanFilter(val === 'all' || !val ? '' : val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 min-w-[120px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] text-xs font-semibold rounded-lg px-3 flex items-center gap-1.5 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="Free">Free</SelectItem>
                <SelectItem value="Starter">Starter</SelectItem>
                <SelectItem value="Pro">Pro</SelectItem>
                <SelectItem value="Team">Team</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter by Status */}
            <Select
              value={statusFilter || 'all'}
              onValueChange={(val) => {
                setStatusFilter(val === 'all' || !val ? '' : val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 min-w-[130px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] text-xs font-semibold rounded-lg px-3 flex items-center gap-1.5 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>

            <button
              type="submit"
              className="ui-btn ui-btn-primary ui-btn-sm"
            >
              Search
            </button>

            {(search || planFilter || statusFilter) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="ui-btn ui-btn-outline ui-btn-sm"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Main Table Panel */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm overflow-hidden animate-fade-in relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-[var(--surface-1)]/50 backdrop-blur-[1px] flex items-center justify-center z-10">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
          </div>
        )}

        <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--muted-foreground)]" />
            <h3 className="font-bold">User Administration Directory</h3>
          </div>
          <div className="ui-badge ui-badge-surface text-xs font-mono">
            {pagination.totalCount > 0
              ? `Showing ${startNum}-${endNum} of ${pagination.totalCount} users`
              : '0 users found'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted-foreground)]">
                {/* Sortable Header - User */}
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-[var(--foreground)] transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span>User</span>
                    {sortBy === 'name' ? (
                      sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : null}
                  </div>
                </th>
                {/* Sortable Header - Timeline */}
                <th
                  onClick={() => handleSort('createdAt')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-[var(--foreground)] transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span>Timeline</span>
                    {sortBy === 'createdAt' ? (
                      sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : null}
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold">Plan & Credits</th>
                {/* Sortable Header - Activity */}
                <th
                  onClick={() => handleSort('analysesCount')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-[var(--foreground)] transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span>Activity</span>
                    {sortBy === 'analysesCount' ? (
                      sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : null}
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold">Organization</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--muted-foreground)]">
                    No users found matching your search and filter criteria.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-[var(--surface-2)] transition-colors group ${
                      user.isBanned ? 'bg-red-500/5 hover:bg-red-500/10' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {user.imageUrl ? (
                          <Image
                            src={user.imageUrl}
                            alt={user.name || 'User profile'}
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-full object-cover border border-[var(--border)] bg-[var(--surface-3)]"
                            referrerPolicy="no-referrer"
                            unoptimized={!user.imageUrl.startsWith('https://img.clerk.com')}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center text-[10px] font-bold text-[var(--muted-foreground)] select-none">
                            {getInitials(user.name, user.email)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-[var(--foreground)] leading-snug flex items-center gap-1.5">
                            <span>{user.name || 'Unnamed'}</span>
                            {user.isBanned && (
                              <span className="bg-red-500/10 text-red-500 text-[9px] font-bold py-0.5 px-1.5 rounded-full uppercase border border-red-500/20">
                                Banned
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)] mt-0.5 font-mono flex items-center gap-1.5">
                            <span>{user.email}</span>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(user.email, `${user.id}-email`)}
                                    className="opacity-0 group-hover:opacity-100 hover:text-[var(--primary)] transition-opacity p-0.5 cursor-pointer"
                                  >
                                    {copiedText === `${user.id}-email` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                }
                              />
                              <TooltipContent>Copy email</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--muted-foreground)]">
                      <div className="flex flex-col gap-1 font-mono text-[11px] whitespace-nowrap">
                        <div>
                          <span className="text-[10px] text-[var(--muted-foreground)] uppercase mr-1.5">Joined:</span>
                          <span className="text-[var(--foreground)]">{formatDate(user.createdAt)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--muted-foreground)] uppercase mr-1.5">Active:</span>
                          <span className="text-[var(--foreground)]">
                            {user.lastSignInAt ? formatDate(user.lastSignInAt) : 'Never'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <div>
                          <span className={`ui-badge text-[10px] uppercase font-bold py-0.5 px-2 ${
                            user.plan.toLowerCase() !== 'free'
                              ? 'ui-badge-warning'
                              : 'ui-badge-surface'
                          }`}>
                            {user.plan}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--muted-foreground)] font-mono">
                          {user.credits} credits left
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="ui-badge ui-badge-surface text-[10px] font-mono border border-[var(--border)]">
                          {user.analysesCount} analyses
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {user.organization ? (
                        <div>
                          <div className="font-semibold flex items-center gap-1.5 leading-snug">
                            <span>{user.organization.name}</span>
                            <span className="ui-badge ui-badge-surface capitalize text-[9px] font-semibold py-0.5">
                              {user.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 font-mono flex items-center gap-1.5">
                            <span className="truncate max-w-[120px]">{user.organization.slug}</span>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(user.organization!.id, `${user.id}-org`)}
                                    className="opacity-0 group-hover:opacity-100 hover:text-[var(--primary)] transition-opacity p-0.5 cursor-pointer"
                                  >
                                    {copiedText === `${user.id}-org` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                }
                              />
                              <TooltipContent>Copy Org ID</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-[var(--muted-foreground)] text-xs italic">No Organization</span>
                          <span className="ui-badge ui-badge-surface capitalize text-[9px] font-semibold self-start py-0.5">
                            {user.role}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {user.organization ? (
                        <div className="flex items-center gap-1.5 text-[var(--success)] text-xs font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Active</span>
                        </div>
                      ) : user.onboardingDraft ? (
                        <div className="flex items-center gap-1.5 text-[var(--warning)] text-xs font-semibold">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Onboarding: {user.onboardingDraft.step}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[var(--muted-foreground)] text-xs font-semibold">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>Pending</span>
                        </div>
                      )}
                    </td>
                    {/* Action Dropdown Column */}
                    <td className="py-3 px-4 text-right relative">
                      {/* Desktop Dropdown - Portal based to escape overflows */}
                      <div className="hidden md:inline-block">
                        <Menu.Root>
                          <Menu.Trigger className="p-1 rounded-md hover:bg-[var(--surface-3)] transition-colors inline-flex text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer">
                            <MoreVertical className="h-4 w-4" />
                          </Menu.Trigger>
                          <Menu.Portal>
                            <Menu.Positioner side="bottom" align="end" sideOffset={4}>
                              <Menu.Popup className="w-48 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-lg z-50 py-1 text-left outline-none animate-in fade-in-50 zoom-in-95 duration-100">
                                <Menu.Item
                                  onClick={() => openAdjustCreditsModal(user)}
                                  className="w-full px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] flex items-center gap-2 border-b border-[var(--border)]/30 cursor-pointer outline-none"
                                >
                                  <CreditCard className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                  <span>Adjust Credits</span>
                                </Menu.Item>
                                
                                <Menu.Item
                                  onClick={() => openDetailsModal(user)}
                                  className="w-full px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] flex items-center gap-2 cursor-pointer outline-none"
                                >
                                  <History className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                  <span>View details & audit</span>
                                </Menu.Item>

                                {!user.organization && !user.onboardingDraft && (
                                  <Menu.Item
                                    onClick={() => triggerResendInviteModal(user)}
                                    className="w-full px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] flex items-center gap-2 border-b border-[var(--border)]/30 cursor-pointer outline-none"
                                  >
                                    <Mail className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>Send Custom Invite</span>
                                  </Menu.Item>
                                )}

                                <Menu.Item
                                  onClick={() => openBanConfirmModal(user)}
                                  className={`w-full px-4 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer outline-none ${
                                    user.isBanned ? 'text-green-500 hover:bg-green-500/5' : 'text-rose-500 hover:bg-rose-500/5'
                                  }`}
                                >
                                  {user.isBanned ? (
                                    <>
                                      <UserCheck className="h-3.5 w-3.5" />
                                      <span>Unban User</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserMinus className="h-3.5 w-3.5" />
                                      <span>Suspend / Ban</span>
                                    </>
                                  )}
                                </Menu.Item>
                              </Menu.Popup>
                            </Menu.Positioner>
                          </Menu.Portal>
                        </Menu.Root>
                      </div>

                      {/* Mobile Trigger - Opens Bottom Sheet */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownUserId(user.id);
                        }}
                        className="md:hidden p-1 rounded-md hover:bg-[var(--surface-3)] transition-colors inline-flex text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 flex items-center justify-between">
            <div className="text-xs text-[var(--muted-foreground)]">
              Showing page <span className="font-semibold">{pagination.page}</span> of{' '}
              <span className="font-semibold">{pagination.totalPages}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[var(--foreground)] cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page === pagination.totalPages}
                className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[var(--foreground)] cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- MODAL DIALOGS --- */}

      {/* Modal 1: Adjust Credits Dialog */}
      {activeModal === 'adjust-credits' && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4 flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[var(--muted-foreground)]" />
                <span>Adjust User Credits</span>
              </h4>
              <button type="button" onClick={() => setActiveModal(null)} className="p-1 rounded-md hover:bg-[var(--surface-3)] transition-colors text-[var(--muted-foreground)] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleAdjustCreditsSubmit} className="p-5 flex flex-col gap-4 text-sm">
              <div className="bg-zinc-800/10 dark:bg-zinc-100/5 p-3 rounded-lg border border-[var(--border)]">
                <div className="font-semibold">{selectedUser.name || 'Unnamed User'}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{selectedUser.email}</div>
                {selectedUser.organization ? (
                  <div className="text-[11px] text-[var(--primary)] mt-2 font-medium">
                    Note: User is in Org &ldquo;{selectedUser.organization.name}&rdquo;. Adjustment will apply to organization credits.
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--muted-foreground)] mt-2 font-medium">
                    Note: User has no organization. Adjustment will apply to personal credits.
                  </div>
                )}
              </div>
 
              {/* Add / Deduct */}
              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1.5">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustDirection('add')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      adjustDirection === 'add'
                        ? 'border-green-500 bg-green-500/10 text-green-500'
                        : 'border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--foreground)]'
                    }`}
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Add Credits</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustDirection('deduct')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      adjustDirection === 'deduct'
                        ? 'border-rose-500 bg-rose-500/10 text-rose-500'
                        : 'border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--foreground)]'
                    }`}
                  >
                    <MinusCircle className="h-4 w-4" />
                    <span>Deduct Credits</span>
                  </button>
                </div>
              </div>
 
              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">
                  Credit Amount
                </label>
                <input
                  type="number"
                  placeholder="Enter amount (e.g. 50)"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value)))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)]"
                  required
                />
              </div>
 
              {/* Ticket Reference */}
              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">
                  Ticket Reference / Reason Key
                </label>
                <input
                  type="text"
                  placeholder="e.g. TICK-1294 or manual adjustment reason"
                  value={adjustTicket}
                  onChange={(e) => setAdjustTicket(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)] placeholder-[var(--muted-foreground)]"
                  required
                />
              </div>
 
              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">
                  Explanation / Internal Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed reason for auditing..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)] placeholder-[var(--muted-foreground)]"
                  required
                />
              </div>
 
              {/* Confirm Buttons */}
              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="ui-btn ui-btn-outline ui-btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjustment}
                  className="ui-btn ui-btn-primary ui-btn-sm flex items-center gap-1.5"
                >
                  {submittingAdjustment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Execute Adjustment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: View Details & Audit Trail Dialog */}
      {activeModal === 'view-details' && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl animate-scale-up flex flex-col max-h-[85vh]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4 flex items-center justify-between flex-shrink-0">
              <h4 className="font-bold flex items-center gap-2">
                <History className="h-5 w-5 text-[var(--muted-foreground)]" />
                <span>User Audit & Details Console</span>
              </h4>
              <button type="button" onClick={() => setActiveModal(null)} className="p-1 rounded-md hover:bg-[var(--surface-3)] transition-colors text-[var(--muted-foreground)] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab selector */}
            <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-4 flex gap-4 text-xs font-semibold flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveDetailsTab('profile')}
                className={`py-3 border-b-2 transition-colors cursor-pointer ${
                  activeDetailsTab === 'profile' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Profile Details
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailsTab('credits')}
                className={`py-3 border-b-2 transition-colors cursor-pointer ${
                  activeDetailsTab === 'credits' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Credit Transactions (Audit Trail)
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailsTab('analyses')}
                className={`py-3 border-b-2 transition-colors cursor-pointer ${
                  activeDetailsTab === 'analyses' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Analysis Logs
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {loadingDetails ? (
                <div className="flex min-h-[200px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
                </div>
              ) : detailsData ? (
                <>
                  {/* Tab Content 1: Profile */}
                  {activeDetailsTab === 'profile' && (
                    <div className="flex flex-col gap-4 text-sm">
                      <div className="flex items-center gap-4 border-b border-[var(--border)] pb-4">
                        {detailsData.user.imageUrl ? (
                          <Image src={detailsData.user.imageUrl} alt="Profile" width={56} height={56} className="h-14 w-14 rounded-full border border-[var(--border)]" unoptimized={!detailsData.user.imageUrl.startsWith('https://img.clerk.com')} />
                        ) : (
                          <div className="h-14 w-14 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-lg font-bold text-[var(--muted-foreground)]">
                            {getInitials(detailsData.user.name, detailsData.user.email)}
                          </div>
                        )}
                        <div>
                          <div className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                            <span>{detailsData.user.name || 'Unnamed User'}</span>
                            {detailsData.user.isBanned && (
                              <span className="ui-badge ui-badge-danger text-xs font-bold uppercase">
                                Banned
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)] font-mono">{detailsData.user.email}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                          <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold">User Database ID</span>
                          <span className="font-mono text-xs text-[var(--foreground)] truncate select-all">{detailsData.user.id}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                          <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold">Plan & Entitlements</span>
                          <span className="text-xs text-[var(--foreground)] font-semibold">{detailsData.user.plan} Subscription</span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                          <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold">Sign Up Date</span>
                          <span className="text-xs text-[var(--foreground)] flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                            {formatDate(detailsData.user.createdAt)}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                          <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold">Last Activity Sign In</span>
                          <span className="text-xs text-[var(--foreground)] flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                            {detailsData.user.lastSignInAt ? formatDate(detailsData.user.lastSignInAt) : 'Never'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 p-3 rounded-lg border border-[var(--border)] bg-zinc-800/10 dark:bg-zinc-100/5 text-left">
                        <div className="text-xs text-[var(--muted-foreground)] font-semibold uppercase mb-2">Organization Status</div>
                        {detailsData.user.organization ? (
                          <div className="flex flex-col gap-1">
                            <div className="font-semibold text-[var(--primary)]">{detailsData.user.organization.name}</div>
                            <div className="text-xs text-[var(--muted-foreground)] font-mono">Slug: {detailsData.user.organization.slug}</div>
                            <div className="text-xs text-[var(--muted-foreground)] font-mono">ID: {detailsData.user.organization.id}</div>
                            <div className="text-xs text-[var(--foreground)] mt-1.5">Role in Org: <span className="capitalize font-semibold">{detailsData.user.role}</span></div>
                          </div>
                        ) : (
                          <div className="text-xs text-[var(--muted-foreground)] italic">User is not in any workspace/organization.</div>
                        )}
                      </div>

                      {/* Subscription & Credit Schedule Details */}
                      <div className="p-3 rounded-lg border border-[var(--border)] bg-zinc-800/10 dark:bg-zinc-100/5 text-left">
                        <div className="text-xs text-[var(--muted-foreground)] font-semibold uppercase mb-3">Subscription & Credit Schedule</div>
                        {detailsData.activeSubscription ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs border-b border-[var(--border)]/50 pb-1.5">
                              <span className="text-[var(--muted-foreground)]">Current Plan:</span>
                              <span className="font-semibold capitalize text-[var(--foreground)]">
                                {detailsData.activeSubscription.plan.replaceAll('_', ' ')}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs border-b border-[var(--border)]/50 pb-1.5">
                              <span className="text-[var(--muted-foreground)]">Status:</span>
                              <span className={`font-semibold uppercase text-[9px] ui-badge ${
                                detailsData.activeSubscription.status === 'active' 
                                  ? 'ui-badge-success' 
                                  : 'ui-badge-warning'
                              }`}>
                                {detailsData.activeSubscription.status === 'cancels_at_period_end' 
                                  ? 'Cancellation Pending' 
                                  : detailsData.activeSubscription.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs border-b border-[var(--border)]/50 pb-1.5">
                              <span className="text-[var(--muted-foreground)]">Current Period End:</span>
                              <span className="font-semibold text-[var(--foreground)]">
                                {formatDate(detailsData.activeSubscription.currentPeriodEnd)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs border-b border-[var(--border)]/50 pb-1.5">
                              <span className="text-[var(--muted-foreground)]">Last Monthly Refill:</span>
                              <span className="font-semibold text-[var(--foreground)]">
                                {detailsData.activeSubscription.lastCreditAllocation 
                                  ? formatDate(detailsData.activeSubscription.lastCreditAllocation) 
                                  : 'Never'}
                              </span>
                            </div>

                            {/* Churn Survey Feedback if cancels_at_period_end */}
                            {(detailsData.activeSubscription.cancelReason || detailsData.activeSubscription.cancelFeedback) && (
                              <div className="mt-2 rounded-lg border border-red-200 dark:border-red-950 bg-red-500/5 p-3 text-[11px] space-y-1.5">
                                <div className="font-bold text-red-600 dark:text-red-400 uppercase tracking-wider text-[9px]">
                                  Cancellation Survey
                                </div>
                                {detailsData.activeSubscription.cancelReason && (
                                  <p className="text-[var(--foreground)]">
                                    <span className="font-semibold text-[var(--muted-foreground)]">Reason:</span>{' '}
                                    {detailsData.activeSubscription.cancelReason}
                                  </p>
                                )}
                                {detailsData.activeSubscription.cancelFeedback && (
                                  <p className="text-[var(--foreground)]">
                                    <span className="font-semibold text-[var(--muted-foreground)]">Feedback:</span>{' '}
                                    &ldquo;{detailsData.activeSubscription.cancelFeedback}&rdquo;
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-[var(--muted-foreground)] italic">No active subscription (Free Tier).</div>
                        )}

                        {/* Queued Downgrade */}
                        {detailsData.queuedSubscription && (
                          <div className="mt-3 p-3 rounded-lg border border-yellow-200/50 dark:border-yellow-950 bg-yellow-500/5 text-left text-xs space-y-1.5">
                            <div className="font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider text-[9px]">
                              Scheduled Downgrade (Queued)
                            </div>
                            <p className="text-[var(--foreground)]">
                              Target Plan: <span className="font-semibold capitalize">{detailsData.queuedSubscription.plan.replaceAll('_', ' ')}</span>
                            </p>
                            <p className="text-[var(--foreground)]">
                              Start Date: <span className="font-semibold">{formatDate(detailsData.queuedSubscription.currentPeriodStart)}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab Content 2: Credits Audit Trail */}
                  {activeDetailsTab === 'credits' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center bg-[var(--surface-2)] p-3 border border-[var(--border)] rounded-lg text-xs font-semibold">
                        <span className="text-[var(--foreground)]">Current Calculated Balance:</span>
                        <span className="font-mono text-sm text-[var(--primary)] font-bold">{detailsData.user.credits} Credits</span>
                      </div>
                      
                      <div className="font-bold text-xs uppercase text-[var(--muted-foreground)] mt-2">Transaction History (Last 20)</div>
                      <div className="flex flex-col gap-2">
                        {detailsData.transactions.length === 0 ? (
                          <div className="text-center py-6 text-xs text-[var(--muted-foreground)] italic">
                            No credit transactions found for this user/organization.
                          </div>
                        ) : (
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          detailsData.transactions.map((tx: any) => (
                            <div key={tx.id} className="p-3 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] flex flex-col md:flex-row md:items-center justify-between text-xs gap-2">
                              <div className="flex flex-col gap-1">
                                <div className="font-semibold text-[var(--foreground)] flex items-center gap-1.5 flex-wrap">
                                  <span className="capitalize">{tx.type.replace(/_/g, ' ')}</span>
                                  <span className="ui-badge ui-badge-surface text-[9px] font-mono capitalize">
                                    {tx.bucket} bucket
                                  </span>
                                  {tx.ticketReference && (
                                    <span className="ui-badge bg-[var(--surface-3)] text-[var(--muted-foreground)] border border-[var(--border)] text-[9px] font-mono">
                                      Ref: {tx.ticketReference}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[var(--muted-foreground)]">
                                  {tx.description || tx.adjustmentReason || 'No description'}
                                </div>
                                <div className="text-[10px] text-[var(--muted-foreground)] font-mono">
                                  {formatDate(tx.createdAt)}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                                  tx.amount >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-rose-500/10 text-rose-500'
                                }}`}>
                                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab Content 3: Analyses logs */}
                  {activeDetailsTab === 'analyses' && (
                    <div className="flex flex-col gap-3">
                      <div className="font-bold text-xs uppercase text-[var(--muted-foreground)] mt-2">Recent Analysis Actions (Last 10)</div>
                      <div className="flex flex-col gap-2">
                        {detailsData.analysisLogs.length === 0 ? (
                          <div className="text-center py-6 text-xs text-[var(--muted-foreground)] italic">
                            No analysis activities recorded for this user.
                          </div>
                        ) : (
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          detailsData.analysisLogs.map((log: any) => (
                            <div key={log.id} className="p-3 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] flex justify-between items-center text-xs">
                              <div>
                                <div className="font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                                  <span className="capitalize">Article Refinement</span>
                                  <span className={`ui-badge text-[9px] font-bold ${
                                    log.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                  }`}>
                                    {log.status}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 font-mono">
                                  {formatDate(log.createdAt)}
                                </div>
                              </div>
                              {log.score !== null && (
                                <div className="text-right">
                                  <span className="font-mono font-bold text-xs bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 px-2 py-0.5 rounded">
                                    Score: {log.score}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-[var(--muted-foreground)]">
                  Error loading user details.
                </div>
              )}
            </div>
            
            <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4 flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="ui-btn ui-btn-outline ui-btn-sm"
              >
                Close Console
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Ban/Unban Confirmation Dialog */}
      {activeModal === 'ban-confirm' && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4 flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2 text-rose-500">
                <ShieldAlert className="h-5 w-5" />
                <span>Confirm User Status Change</span>
              </h4>
              <button type="button" onClick={() => setActiveModal(null)} className="p-1 rounded-md hover:bg-[var(--surface-3)] transition-colors text-[var(--muted-foreground)] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4 text-xs">
              <div className="text-[var(--foreground)] text-sm leading-relaxed">
                {selectedUser.isBanned ? (
                  <>
                    Are you sure you want to <strong>unban</strong> the user <strong>{selectedUser.name || selectedUser.email}</strong>? They will regain complete access to their workspace resources immediately.
                  </>
                ) : (
                  <>
                    Are you sure you want to <strong>ban/suspend</strong> the user <strong>{selectedUser.name || selectedUser.email}</strong>?
                    <br />
                    <span className="block mt-2 font-semibold text-rose-500">
                      Warning: This calls Clerk&apos;s ban API, revokes all active sign-in sessions, and blocks them from signing into Envoyou AI.
                    </span>
                  </>
                )}
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="ui-btn ui-btn-outline ui-btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleToggleBan}
                  className={`ui-btn ui-btn-sm ${
                    selectedUser.isBanned ? 'bg-green-600 hover:bg-green-700 text-white border-none' : 'ui-btn-danger'
                  }`}
                >
                  {selectedUser.isBanned ? 'Unban User' : 'Ban User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal 4: Send Custom Invite Email Dialog */}
      {activeModal === 'send-invite' && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-scale-up">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4 flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2">
                <Mail className="h-5 w-5 text-[var(--muted-foreground)]" />
                <span>Send Custom Invite</span>
              </h4>
              <button type="button" onClick={() => setActiveModal(null)} className="p-1 rounded-md hover:bg-[var(--surface-3)] transition-colors text-[var(--muted-foreground)] cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleSendInviteSubmit} className="p-5 flex flex-col gap-4 text-sm">
              <div className="bg-zinc-800/10 dark:bg-zinc-100/5 p-3 rounded-lg border border-[var(--border)]">
                <div className="font-semibold">{selectedUser.name || 'Unnamed User'}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{selectedUser.email}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={inviteSubject}
                  onChange={(e) => setInviteSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[var(--muted-foreground)] mb-1">
                  Message Content
                </label>
                <textarea
                  rows={6}
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)] resize-none"
                  required
                />
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="ui-btn ui-btn-outline ui-btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingInvite}
                  className="ui-btn ui-btn-primary ui-btn-sm"
                >
                  {sendingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Mobile Bottom Sheet */}
      {activeDropdownUserId && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-[140] flex items-end justify-center animate-in fade-in duration-200"
          onClick={() => setActiveDropdownUserId(null)}
        >
          <div
            className="w-full bg-[var(--surface-1)] border-t border-[var(--border)] rounded-t-2xl px-4 pt-2 pb-8 flex flex-col gap-1.5 animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-12 h-1.5 bg-[var(--border)] rounded-full mx-auto my-2 opacity-60 shrink-0" />
            
            {/* User Info in sheet header */}
            {(() => {
              const u = users.find(user => user.id === activeDropdownUserId);
              if (!u) return null;
              return (
                <div className="flex items-center gap-3 border-b border-[var(--border)] pb-3 mb-1">
                  {u.imageUrl ? (
                    <Image src={u.imageUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover border border-[var(--border)]" unoptimized={!u.imageUrl.startsWith('https://img.clerk.com')} />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-xs font-bold text-[var(--muted-foreground)]">
                      {getInitials(u.name, u.email)}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sm text-[var(--foreground)]">{u.name || 'Unnamed'}</div>
                    <div className="text-xs text-[var(--muted-foreground)] font-mono">{u.email}</div>
                  </div>
                </div>
              );
            })()}

            {/* Actions list */}
            {(() => {
              const u = users.find(user => user.id === activeDropdownUserId);
              if (!u) return null;
              return (
                <div className="flex flex-col gap-0.5 py-1">
                  <button
                    type="button"
                    onClick={() => { openAdjustCreditsModal(u); setActiveDropdownUserId(null); }}
                    className="w-full flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-3)] cursor-pointer border-none bg-transparent transition-colors text-left"
                  >
                    <CreditCard className="h-4 w-4 text-[var(--muted-foreground)]" />
                    <span>Adjust Credits</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => { openDetailsModal(u); setActiveDropdownUserId(null); }}
                    className="w-full flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-3)] cursor-pointer border-none bg-transparent transition-colors text-left"
                  >
                    <History className="h-4 w-4 text-[var(--muted-foreground)]" />
                    <span>View details & audit</span>
                  </button>

                  {!u.organization && !u.onboardingDraft && (
                    <button
                      type="button"
                      onClick={() => { triggerResendInviteModal(u); setActiveDropdownUserId(null); }}
                      className="w-full flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-3)] cursor-pointer border-none bg-transparent transition-colors text-left"
                    >
                      <Mail className="h-4 w-4 text-[var(--muted-foreground)]" />
                      <span>Send Custom Invite</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { openBanConfirmModal(u); setActiveDropdownUserId(null); }}
                    className={`w-full flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-medium transition-colors text-left cursor-pointer ${
                      u.isBanned
                        ? 'text-green-500 hover:bg-green-500/10 active:bg-green-500/20'
                        : 'text-rose-500 hover:bg-rose-500/10 active:bg-rose-500/20'
                    }`}
                  >
                    {u.isBanned ? (
                      <>
                        <UserCheck className="h-4 w-4" />
                        <span>Unban User</span>
                      </>
                    ) : (
                      <>
                        <UserMinus className="h-4 w-4" />
                        <span>Suspend / Ban User</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
