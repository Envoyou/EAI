'use client';

import { useEffect, useState } from 'react';
import { Loader2, Users, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';

type DirectoryUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  trialUsed: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  onboardingDraft: {
    step: string;
  } | null;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export function UserDirectory() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/users', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load users');
        return res.json();
      })
      .then((data) => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        toast.error('Failed to load user directory');
      });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-500">
        <AlertCircle className="h-8 w-8 mb-3 opacity-80" />
        <p className="font-semibold">Failed to load directory</p>
        <p className="text-sm opacity-80 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[var(--muted-foreground)]" />
          <h3 className="font-bold">Recent Signups</h3>
        </div>
        <div className="ui-badge ui-badge-surface text-xs font-mono">
          Showing {users.length} users
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted-foreground)]">
              <th className="py-3 px-4 font-semibold">User</th>
              <th className="py-3 px-4 font-semibold">Joined Date</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Organization</th>
              <th className="py-3 px-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-[var(--muted-foreground)]">
                  No users found in the database.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-[var(--foreground)]">{user.name || 'Unnamed'}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{user.email}</div>
                  </td>
                  <td className="py-3 px-4 tabular-nums text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="ui-badge ui-badge-surface capitalize text-[10px]">
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {user.organization ? (
                      <div>
                        <div className="font-medium">{user.organization.name}</div>
                        <div className="text-xs text-[var(--muted-foreground)] mt-0.5 font-mono">
                          {user.organization.slug}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[var(--muted-foreground)] text-xs italic">No Organization</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {user.organization ? (
                      <div className="flex items-center gap-1.5 text-[var(--success)] text-xs font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Active</span>
                      </div>
                    ) : user.onboardingDraft ? (
                      <div className="flex items-center gap-1.5 text-[var(--warning)] text-xs font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Onboarding: {user.onboardingDraft.step}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[var(--muted-foreground)] text-xs font-medium">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Pending</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
