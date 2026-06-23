'use client';

import React from 'react';
import { Activity, FileText, CheckCircle, Users, Download, Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboard } from './DashboardProvider';

const sections = [
  { id: 'overview', label: 'Overview', icon: Activity, href: '/dashboard/overview' },
  { id: 'performance', label: 'Performance', icon: FileText, href: '/dashboard/performance' },
  { id: 'trends', label: 'Trends & Verdicts', icon: CheckCircle, href: '/dashboard/trends' },
  { id: 'productivity', label: 'Productivity & Coach', icon: Users, href: '/dashboard/productivity' },
] as const;

export function DashboardLayoutShell({ children, isSuperAdmin }: { children: React.ReactNode; isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const {
    data,
    loading,
    timeRange,
    setTimeRange,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    handleDownloadCSV,
  } = useDashboard();

  if (pathname.startsWith('/dashboard/validation')) {
    return <>{children}</>;
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
      </div>
    );
  }

  return (
    <WorkspacePageShell
      title="Analytics Dashboard"
      description="Editorial Quality & Performance Overview"
      currentPage="dashboard"
      actions={
        <div className="flex items-center gap-2">
          {/* Date Selector Dropdown */}
          <Select value={timeRange} onValueChange={(val) => val && setTimeRange(val)}>
            <SelectTrigger className="px-3 py-1.5 text-xs font-semibold border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-colors rounded-full cursor-pointer text-[var(--foreground)] h-auto shadow-sm data-[state=open]:bg-[var(--surface-2)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="text-xs">
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {timeRange === 'custom' && (
            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 rounded-lg text-foreground focus:outline-none"
              />
              <span className="text-[10px] text-muted-foreground">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 rounded-lg text-foreground focus:outline-none"
              />
            </div>
          )}

          {/* Download CSV Button */}
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] rounded-full text-xs font-semibold transition-colors shadow-sm cursor-pointer text-[var(--foreground)]"
            aria-label="Download Report as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      }
      sidebar={
        <>


          <nav aria-label="Dashboard sections" className="settings-page-nav">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = pathname.startsWith(section.href);
              return (
                <Link
                  key={section.id}
                  href={section.href}
                  data-active={isActive}
                  aria-current={isActive ? 'page' : undefined}
                  prefetch={false}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </Link>
              );
            })}

            {isSuperAdmin && (
              <>
                <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Internal
                </div>
                <Link
                  href="/dashboard/validation"
                  data-active={pathname.startsWith('/dashboard/validation')}
                  aria-current={pathname.startsWith('/dashboard/validation') ? 'page' : undefined}
                  prefetch={false}
                >
                  <ShieldAlert className="h-4 w-4" />
                  Validation
                </Link>
              </>
            )}
          </nav>
        </>
      }
    >
      <div className="settings-page-content scroll-y-auto">
        <div className="settings-page-intro">
          <span>Analytics Dashboard</span>
          <h2>Editorial Quality &amp; Performance Overview</h2>
          <p>Track and optimize the quality of your publication&apos;s refined drafts.</p>
        </div>
        
        {children}
      </div>
    </WorkspacePageShell>
  );
}
