'use client';

import React from 'react';
import { Users, Layers } from 'lucide-react';
import { useDashboard } from '@/components/DashboardProvider';

export default function ProductivityPage() {
  const { data } = useDashboard();

  if (!data) return null;

  return (
    <section id="productivity" className="settings-page-section">
      <div className="settings-page-section-heading">
        <h2>Productivity &amp; Coaching</h2>
        <p>Editor activity leaderboard and category breakdown.</p>
      </div>
      <div className="settings-page-section-body py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor Performance Table */}
          <div className="lg:col-span-2 surface-card p-6 min-w-0 flex flex-col">
            <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-foreground">
              <Users className="w-5 h-5 text-primary" /> Editor Productivity &amp; Coaching
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-muted-foreground uppercase font-semibold tracking-wider">
                    <th className="pb-3 pl-2">Editor</th>
                    <th className="pb-3 text-center">Reviews</th>
                    <th className="pb-3 text-center">Ready Rate</th>
                    <th className="pb-3 text-center">Avg. Revisions</th>
                    <th className="pb-3 text-right pr-2">Assessment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {data.userBreakdown.map((user) => {
                    let statusLabel = 'Active';
                    let badgeClass = 'text-slate-500 bg-slate-500/10 border-slate-200 dark:border-slate-800';
                    
                    if (user.logsCount >= 2) {
                      if (user.readyRate >= 85) {
                        statusLabel = 'Top Performer';
                        badgeClass = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 dark:border-emerald-500/30';
                      } else if (user.readyRate < 60 || user.avgRevisions >= 3) {
                        statusLabel = 'Coaching Suggested';
                        badgeClass = 'text-amber-500 bg-amber-500/10 border-amber-500/20 dark:border-amber-500/30';
                      }
                    }

                    return (
                      <tr key={user.userId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                        <td className="py-4 pl-2 flex items-center gap-3">
                          {user.imageUrl ? (
                            // Clerk avatar hosts vary by account, so this small image uses the native element.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.imageUrl} alt={user.name} className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-800 object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-[10px] uppercase">
                              {user.name.slice(0, 2)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-foreground">{user.name}</div>
                            <div className="text-[10px] text-muted-foreground">{user.email}</div>
                          </div>
                        </td>
                        <td className="py-4 text-center font-medium text-foreground">{user.logsCount}</td>
                        <td className="py-4 text-center font-medium">
                          <span className={`${user.readyRate >= 80 ? 'text-emerald-500' : user.readyRate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                            {user.readyRate}%
                          </span>
                        </td>
                        <td className="py-4 text-center text-foreground font-medium">{user.avgRevisions}x</td>
                        <td className="py-4 text-right pr-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {data.userBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                        No editor activities recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Distribution */}
          <div className="surface-card p-6 flex flex-col min-w-0">
            <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-foreground">
              <Layers className="w-5 h-5 text-primary" /> Category Distribution
            </h3>
            <div className="space-y-4 overflow-y-auto max-h-[350px] pr-2">
              {data.categoryBreakdown.map((cat) => {
                const percentage = data.totalLogs > 0 ? Math.round((cat.count / data.totalLogs) * 100) : 0;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-foreground truncate max-w-[70%]">{cat.name}</span>
                      <span className="text-muted-foreground">{cat.count} ({percentage}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--surface-2)] rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
              {data.categoryBreakdown.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8">No categories recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
