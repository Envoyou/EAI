import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  DirectoryUser,
  PaginationMeta,
  UserDetailsData,
  ModalType,
} from '../types';

export const generateIdempotencyKey = () => {
  return `adj_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
};

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export const getInitials = (name: string | null, email: string) => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length > 0) {
      return parts.map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    }
  }
  return email.slice(0, 2).toUpperCase();
};

export function useUserDirectory() {
  const fetchSequenceRef = useRef(0);
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
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);

  // Custom Invitation Email States
  const [inviteSubject, setInviteSubject] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Modal loaded data
  const [detailsData, setDetailsData] = useState<UserDetailsData | null>(null);
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
    const fetchSequence = ++fetchSequenceRef.current;
    Promise.resolve().then(() => {
      setLoading(true);
      setError(null);
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
        if (fetchSequence !== fetchSequenceRef.current) return;
        setUsers(data.users || []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (fetchSequence !== fetchSequenceRef.current) return;
        setError(err.message);
        setLoading(false);
        toast.error('Failed to load user directory');
      });
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, planFilter, statusFilter, sortBy, sortOrder]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearch('');
    setPlanFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
    toast.success('Copied to clipboard');
  };

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

  const openAdjustCreditsModal = (user: DirectoryUser) => {
    setSelectedUser(user);
    setAdjustDirection('add');
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustTicket('');
    setAdjustIdempotency(generateIdempotencyKey());
    setActiveModal('adjust-credits');
  };

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

      toast.success(
        `Successfully adjusted credits (${adjustDirection === 'add' ? '+' : '-'}${adjustAmount})`
      );
      fetchUsers();
      setActiveModal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmittingAdjustment(false);
    }
  };

  const openBanConfirmModal = (user: DirectoryUser) => {
    setSelectedUser(user);
    setActiveModal('ban-confirm');
  };

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

  const triggerResendInviteModal = (user: DirectoryUser) => {
    setSelectedUser(user);
    setInviteSubject('Lanjutkan Pendaftaran Anda di Envoyou AI');
    setInviteMessage(
      `Halo ${user.name || 'User'},\n\nSilakan klik tombol di bawah ini untuk melanjutkan pendaftaran dan masuk ke workspace Envoyou AI Anda. Kami telah menambahkan bonus 50 kredit gratis ke akun Anda untuk langsung dicoba!`
    );
    setActiveModal('send-invite');
  };

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
        }),
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

  return {
    users,
    pagination,
    loading,
    error,
    search,
    searchInput,
    setSearchInput,
    planFilter,
    setPlanFilter,
    statusFilter,
    setStatusFilter,
    sortBy,
    sortOrder,
    page,
    setPage,
    copiedText,
    activeModal,
    setActiveModal,
    selectedUser,
    inviteSubject,
    setInviteSubject,
    inviteMessage,
    setInviteMessage,
    sendingInvite,
    detailsData,
    loadingDetails,
    activeDetailsTab,
    setActiveDetailsTab,
    adjustDirection,
    setAdjustDirection,
    adjustAmount,
    setAdjustAmount,
    adjustReason,
    setAdjustReason,
    adjustTicket,
    setAdjustTicket,
    adjustIdempotency,
    setAdjustIdempotency,
    submittingAdjustment,
    fetchUsers,
    handleSearchSubmit,
    handleClearFilters,
    handleSort,
    copyToClipboard,
    openDetailsModal,
    openAdjustCreditsModal,
    handleAdjustCreditsSubmit,
    openBanConfirmModal,
    handleToggleBan,
    triggerResendInviteModal,
    handleSendInviteSubmit,
  };
}
