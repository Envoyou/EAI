'use client';

import React from 'react';
import { Activity, AlertTriangle, FileText } from 'lucide-react';
import { useDashboard } from '@/components/DashboardProvider';

export default function OverviewPage() {
  const { data, timeRange } = useDashboard();

  if (!data) return null;

  return (
    <section id="overview" className="settings-page-section">
      <div className="settings-page-section-heading">
        <h2>Overview</h2>
        <p>Summary statistics of your organization&apos;s reviews.</p>
      </div>
      <div className="settings-page-section-body py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="surface-card surface-card-hover p-6 flex items-center gap-4">
            <div className="p-3 bg-primary-50 dark:bg-primary rounded-xl text-primary-600 dark:text-primary-foreground">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Reviews</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold mt-0.5">{data.totalLogs}</h3>
                {data.periodComparison && (
                  <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${
                    data.periodComparison.totalLogsChange > 0 
                      ? 'text-emerald-500' 
                      : data.periodComparison.totalLogsChange < 0 
                        ? 'text-rose-500' 
                        : 'text-slate-400'
                  }`}>
                    {data.periodComparison.totalLogsChange > 0 ? '▲' : data.periodComparison.totalLogsChange < 0 ? '▼' : ''}{' '}
                    {Math.abs(data.periodComparison.totalLogsChange)}% <span className="text-[9px] text-muted-foreground font-normal">{timeRange === '7d' ? 'vs last wk' : 'vs last mo'}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="surface-card surface-card-hover p-6 flex items-center gap-4">
            <div className="p-3 bg-primary-50 dark:bg-primary rounded-xl text-primary-600 dark:text-primary-foreground">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ready Rate</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold mt-0.5">{data.readyRate}%</h3>
                {data.periodComparison && (
                  <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${
                    data.periodComparison.readyRateChange > 0 
                      ? 'text-emerald-500' 
                      : data.periodComparison.readyRateChange < 0 
                        ? 'text-rose-500' 
                        : 'text-slate-400'
                  }`}>
                    {data.periodComparison.readyRateChange > 0 ? '▲' : data.periodComparison.readyRateChange < 0 ? '▼' : ''}{' '}
                    {data.periodComparison.readyRateChange > 0 ? '+' : ''}{data.periodComparison.readyRateChange}% <span className="text-[9px] text-muted-foreground font-normal">{timeRange === '7d' ? 'vs last wk' : 'vs last mo'}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="surface-card surface-card-hover p-6 flex items-center gap-4">
            <div className="p-3 bg-primary-50 dark:bg-primary rounded-xl text-primary-600 dark:text-primary-foreground">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Flags</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold mt-0.5">{data.flagsData.reduce((acc, curr) => acc + curr.count, 0)}</h3>
                {data.periodComparison && (
                  <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${
                    data.periodComparison.flagsChange < 0 
                      ? 'text-emerald-500' 
                      : data.periodComparison.flagsChange > 0 
                        ? 'text-rose-500' 
                        : 'text-slate-400'
                  }`}>
                    {data.periodComparison.flagsChange > 0 ? '▲' : data.periodComparison.flagsChange < 0 ? '▼' : ''}{' '}
                    {Math.abs(data.periodComparison.flagsChange)}% <span className="text-[9px] text-muted-foreground font-normal">{timeRange === '7d' ? 'vs last wk' : 'vs last mo'}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
