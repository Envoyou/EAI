'use client';

import React from 'react';
import { useDashboard } from '@/components/DashboardProvider';

export default function PerformancePage() {
  const { data } = useDashboard();

  if (!data) return null;

  const formatTime = (minutes: number) => {
    if (minutes === 0) return '0 mins';
    if (minutes < 60) return `${minutes} mins`;
    const hours = (minutes / 60).toFixed(1);
    return `${hours} hours`;
  };

  const renderProgressCard = (label: string, value: number) => {
    const colorClass = value >= 80 
      ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 dark:border-emerald-500/30' 
      : value >= 60 
        ? 'text-amber-500 bg-amber-500/10 border-amber-500/20 dark:border-amber-500/30' 
        : 'text-slate-500 bg-slate-500/10 border-slate-200 dark:border-slate-800';
        
    const barColorClass = value >= 80 
      ? 'bg-emerald-500' 
      : value >= 60 
        ? 'bg-amber-500' 
        : 'bg-slate-400 dark:bg-slate-600';

    return (
      <div className="surface-card surface-card-hover p-5">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}>
            {value}%
          </span>
        </div>
        <div className="text-2xl font-bold mt-2 text-foreground">{value}%</div>
        <div className="h-1.5 w-full bg-[var(--surface-2)] rounded-full mt-3 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barColorClass}`} style={{ width: `${value}%` }} />
        </div>
      </div>
    );
  };

  const renderCountCard = (label: string, value: string | number) => {
    return (
      <div className="surface-card surface-card-hover p-5">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-2xl font-bold mt-2 text-foreground">{value}</div>
      </div>
    );
  };

  return (
    <section id="performance" className="settings-page-section">
      <div className="settings-page-section-heading">
        <h2>Editorial Performance</h2>
        <p>Breakdown of key editorial and SEO KPIs.</p>
      </div>
      <div className="settings-page-section-body py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {renderCountCard("Drafts Processed", data.draftsThisMonth)}
          {renderProgressCard("Completion Rate", data.polishedRate)}
          {renderProgressCard("SEO Pack Completion", data.seoCompletionRate)}
          {renderProgressCard("Voice Match Rate", data.povMatchRate)}
          {renderProgressCard("Directly Publishable", data.polishedRate)}
          {renderProgressCard("CMS Export Success", data.cmsExportSuccessRate)}
          {renderCountCard("Avg. Articles Per User", data.avgArticlesPerUser)}
          {renderCountCard("Avg. Time-to-Publish", formatTime(data.avgTimeToPublish))}
          {renderCountCard("Avg. Revisions", `${data.avgRevisionsPerArticle} revs`)}
        </div>
      </div>
    </section>
  );
}
