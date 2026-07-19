'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import React, { useEffect, useState } from 'react';
import { Loader2, Search, Eye, Filter, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AuditLog = {
  id: string;
  action: string;
  actorId: string;
  actorEmail: string;
  targetId: string | null;
  targetType: string | null;
  description: string | null;
  details: Record<string, unknown> | Array<unknown> | null;
  createdAt: string;
};

type PaginationMeta = {
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'credit.adjust': { label: 'Credit Adjust', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  'tenant.ai_config.update': { label: 'AI Config Update', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  'tenant.subscription.override': { label: 'Sub Override', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  'feature_flag.update': { label: 'Feature Flag', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  'user.ban': { label: 'User Ban', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
  'user.unban': { label: 'User Unban', color: 'bg-teal-500/10 text-teal-500 border-teal-500/20' },
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));

export default function AuditLogsAdminPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    totalCount: 0,
    totalPages: 1,
    page: 1,
    limit: 10,
  });

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async (currentPage = 1) => {
    setLoading(true);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/audit-logs?page=${currentPage}&limit=10&search=${encodeURIComponent(
          search.trim()
        )}&action=${encodeURIComponent(actionFilter)}`
      );
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      setLogs(data.logs || []);
      setPagination(data.pagination);
      setPage(currentPage);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const getActionBadge = (action: string) => {
    const info = ACTION_LABELS[action] || { label: action, color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${info.color}`}>
        {info.label}
      </span>
    );
  };

  return (
    <>
      <div className="settings-page-intro">
        <span className="ui-badge ui-badge-warning uppercase tracking-wider !text-[9px] mb-2 inline-flex">Internal Use Only</span>
        <h2 className="text-balance">System Audit Logs</h2>
        <p className="text-pretty">Operational log history of administrative events for system auditing and compliance.</p>
      </div>

      <div className="mt-6 space-y-4">
        {/* Search & Filters */}
        <form onSubmit={handleSearchSubmit} className="ui-card p-4 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Search Description / Actor
            </label>
            <div className="flex gap-2">
              <Input
                variant="surface"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs"
                placeholder="Search actor email, target ID, details..."
                aria-label="Search logs"
              />
              <button
                type="submit"
                disabled={loading}
                className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>
          </div>

          <div className="w-full sm:w-[220px] space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
              <Filter className="h-3 w-3" />
              Filter by Action
            </label>
            <Select
              value={actionFilter || 'all'}
              onValueChange={(value) => {
                if (value !== null) setActionFilter(value === 'all' ? '' : value);
              }}
            >
              <SelectTrigger
                variant="surface"
                className="h-[34px] w-full text-xs"
                aria-label="Filter by action"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Action Types</SelectItem>
                <SelectItem value="credit.adjust">Credit Adjustments</SelectItem>
                <SelectItem value="tenant.ai_config.update">AI Engine Overrides</SelectItem>
                <SelectItem value="tenant.subscription.override">Plan Overrides</SelectItem>
                <SelectItem value="feature_flag.update">Feature Flag Toggles</SelectItem>
                <SelectItem value="user.ban">User Bans</SelectItem>
                <SelectItem value="user.unban">User Unbans</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>

        {/* Table & Data */}
        <div className="ui-card overflow-hidden">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] mb-2" />
              <span className="text-xs text-[var(--muted-foreground)]">Loading audit logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--muted-foreground)]">
              No audit logs found matching the search criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--surface-1)] transition-colors">
                      <td className="p-3 text-[var(--muted-foreground)] whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="p-3 font-semibold text-[var(--foreground)] truncate max-w-[150px]">
                        {log.actorEmail}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-[var(--muted-foreground)] whitespace-nowrap">
                        {log.targetId ? (
                          <span>
                            {log.targetType}: {log.targetId.slice(0, 12)}...
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="p-3 text-[var(--foreground)] truncate max-w-[280px]">
                        {log.description}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="ui-btn ui-btn-muted ui-btn-xs"
                          aria-label="View log details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 bg-[var(--surface-1)]">
              <span className="text-[10px] text-[var(--muted-foreground)]">
                Showing page <strong>{page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.totalCount} entries)
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => fetchLogs(page - 1)}
                  className="ui-btn ui-btn-muted ui-btn-xs"
                  aria-label="Previous page"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages || loading}
                  onClick={() => fetchLogs(page + 1)}
                  className="ui-btn ui-btn-muted ui-btn-xs"
                  aria-label="Next page"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slide-over Drawer for Log Details */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setSelectedLog(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity border-none cursor-pointer"
            aria-label="Close detail panel"
          />
          
          {/* Panel */}
          <div className="relative w-full max-w-lg bg-[var(--background)] h-full flex flex-col shadow-2xl border-l border-[var(--border)] z-10 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-2">
                {getActionBadge(selectedLog.action)}
                <span className="text-xs font-bold text-[var(--foreground)]">Audit Detail</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="ui-btn ui-btn-muted ui-btn-icon h-7 w-7"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-[var(--foreground)]">
              <div className="space-y-3.5 bg-[var(--surface-1)] p-4 rounded-xl border border-[var(--border)]">
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted-foreground)]">Aktor:</span>
                  <span className="font-semibold text-right">{selectedLog.actorEmail}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted-foreground)]">ID Aktor:</span>
                  <span className="font-mono text-[10px] text-right">{selectedLog.actorId}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted-foreground)]">Target:</span>
                  <span className="font-semibold text-right">
                    {selectedLog.targetId ? `${selectedLog.targetType} (${selectedLog.targetId})` : 'System Global'}
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-[var(--muted-foreground)]">Tanggal:</span>
                  <span className="font-semibold text-right">{formatDate(selectedLog.createdAt)}</span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Description</span>
                <p className="p-3 bg-[var(--surface-1)] rounded-lg border border-[var(--border)] leading-relaxed">
                  {selectedLog.description}
                </p>
              </div>

              {/* Payload Comparison JSON */}
              {selectedLog.details && (
                <div className="space-y-1.5 flex flex-col h-[280px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] shrink-0">
                    Audit Payload Comparison (JSON)
                  </span>
                  <pre className="flex-1 p-3 bg-zinc-950 dark:bg-black text-[10px] font-mono text-emerald-400 overflow-auto rounded-lg border border-[var(--border)]">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
