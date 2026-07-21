'use client';

import React from 'react';
import { Activity, FileText, CheckCircle, Users, Download, Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboard } from './DashboardProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

  if (pathname.includes('/dashboard/validation')) {
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
            <div className="hidden sm:flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <Input
                variant="surface"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-auto w-auto px-2.5 py-1 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">to</span>
              <Input
                variant="surface"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-auto w-auto px-2.5 py-1 text-xs"
              />
            </div>
          )}

          {/* Download CSV Button */}
          <Button
            type="button"
            onClick={handleDownloadCSV}
            variant="outline"
            size="sm"
            className="rounded-full text-xs font-semibold text-[var(--foreground)] shadow-xs"
            aria-label="Download Report as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
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

        {/* Mobile Custom Date Range Inputs */}
        {timeRange === 'custom' && (
          <div className="sm:hidden flex items-center gap-2 mb-6 p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl w-fit animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold text-[var(--muted-foreground)] uppercase">Start Date</span>
              <Input
                variant="surface"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-auto w-auto px-2.5 py-1.5 text-xs"
              />
            </div>
            <span className="text-[10px] text-muted-foreground mt-4 shrink-0">to</span>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold text-[var(--muted-foreground)] uppercase">End Date</span>
              <Input
                variant="surface"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-auto w-auto px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>
        )}
        
        {children}
      </div>
    </WorkspacePageShell>
  );
}
