'use client';

import Image from 'next/image';
import {
  Users,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserActionMenu } from './UserActionMenu';
import type { DirectoryUser, PaginationMeta } from '../types';
import { formatDate, getInitials } from '../hooks/useUserDirectory';

interface UserTableProps {
  users: DirectoryUser[];
  pagination: PaginationMeta;
  loading: boolean;
  search: string;
  searchInput: string;
  setSearchInput: (val: string) => void;
  planFilter: string;
  setPlanFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  setPage: (val: number) => void;
  copiedText: string | null;
  onSearchSubmit: (e: React.FormEvent) => void;
  onClearFilters: () => void;
  onSort: (field: string) => void;
  onCopyToClipboard: (text: string, id: string) => void;
  onOpenDetails: (user: DirectoryUser) => void;
  onOpenAdjustCredits: (user: DirectoryUser) => void;
  onResendInvite: (user: DirectoryUser) => void;
  onToggleBanConfirm: (user: DirectoryUser) => void;
}

export function UserTable({
  users,
  pagination,
  loading,
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
  onSearchSubmit,
  onClearFilters,
  onSort,
  onCopyToClipboard,
  onOpenDetails,
  onOpenAdjustCredits,
  onResendInvite,
  onToggleBanConfirm,
}: UserTableProps) {
  const startNum = (page - 1) * pagination.limit + 1;
  const endNum = Math.min(page * pagination.limit, pagination.totalCount);

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Filter Header Panel */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm">
        <form onSubmit={onSearchSubmit} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)] pointer-events-none z-10" />
            <Input
              variant="surface"
              type="text"
              placeholder="Search by Name, Email, User ID, or Org Slug..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="!pl-9 pr-4 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filter by Plan */}
            <Select
              value={planFilter || 'all'}
              onValueChange={(val) => {
                if (val !== null) {
                  setPlanFilter(val === 'all' ? '' : val);
                  setPage(1);
                }
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
                if (val !== null) {
                  setStatusFilter(val === 'all' ? '' : val);
                  setPage(1);
                }
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

            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>

            {(search || planFilter || statusFilter) && (
              <Button
                type="button"
                onClick={onClearFilters}
                variant="outline"
                size="sm"
              >
                Clear
              </Button>
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
          <Badge variant="surface" className="text-xs font-mono">
            {pagination.totalCount > 0
              ? `Showing ${startNum}-${endNum} of ${pagination.totalCount} users`
              : '0 users found'}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted-foreground)]">
                <th
                  onClick={() => onSort('name')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-[var(--foreground)] transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span>User</span>
                    {sortBy === 'name' ? (
                      sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : null}
                  </div>
                </th>
                <th
                  onClick={() => onSort('createdAt')}
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
                <th
                  onClick={() => onSort('analysesCount')}
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
                                  <Button
                                    type="button"
                                    onClick={() => onCopyToClipboard(user.email, `${user.id}-email`)}
                                    variant="ghost"
                                    size="icon-xs"
                                    className="opacity-0 group-hover:opacity-100 hover:text-[var(--primary)] transition-opacity cursor-pointer border-none p-0"
                                  >
                                    {copiedText === `${user.id}-email` ? (
                                      <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
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
                          <Badge
                            variant={
                              user.plan === 'Pro' || user.plan === 'Team'
                                ? 'primary'
                                : user.plan === 'Starter'
                                  ? 'surface'
                                  : 'muted'
                            }
                            className="px-2 py-0.5 text-[10px] font-bold uppercase"
                          >
                            {user.plan}
                          </Badge>
                        </div>
                        <div className="text-xs font-semibold text-[var(--foreground)] font-mono">
                          {user.credits} credits
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono font-semibold text-[var(--foreground)]">
                      {user.analysesCount} logs
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {user.organization ? (
                        <div>
                          <div className="font-semibold text-[var(--foreground)]">{user.organization.name}</div>
                          <div className="text-[10px] text-[var(--muted-foreground)] font-mono">{user.organization.slug}</div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--muted-foreground)] italic">No Org</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {user.organization ? (
                        <Badge variant="success" className="text-[10px] font-bold uppercase">Active</Badge>
                      ) : user.onboardingDraft ? (
                        <Badge variant="warning" className="text-[10px] font-bold uppercase">Onboarding</Badge>
                      ) : (
                        <Badge variant="muted" className="text-[10px] font-bold uppercase">
                          Pending
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <UserActionMenu
                        user={user}
                        onOpenDetails={onOpenDetails}
                        onOpenAdjustCredits={onOpenAdjustCredits}
                        onResendInvite={onResendInvite}
                        onToggleBanConfirm={onToggleBanConfirm}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between text-xs">
            <span className="text-[var(--muted-foreground)]">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                variant="ghost"
                size="icon-xs"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
                variant="ghost"
                size="icon-xs"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
