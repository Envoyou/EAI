'use client';

import { useEffect, useState } from 'react';
import { FileText, CheckCircle, Activity, AlertTriangle, Loader2, ArrowLeft, Download, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { WorkspacePageShell } from '@/components/WorkspacePageShell';
import { useRouter } from 'next/navigation';

interface MetricDetail {
  current: number;
  target: number;
  label: string;
  isPercentage?: boolean;
  isDuration?: boolean;
  isCurrency?: boolean;
  isUsd?: boolean;
  isReverse?: boolean;
  isEstimated?: boolean;
  coverage?: number;
}

interface ValidationData {
  totalLogs: number;
  readyRate: number;
  telemetrySummary: {
    trackedOutputs: number;
    coveragePercentage: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalEstimatedCostIdr: number;
    pricingVersions: string[];
  };
  validationReport: {
    productUsage: Record<string, MetricDetail>;
    outputQuality: Record<string, MetricDetail>;
    efficiencyGain: Record<string, MetricDetail>;
    commercialReadiness: Record<string, MetricDetail>;
  };
}

const sections = [
  { id: 'telemetry', label: 'Overview', icon: Activity },
  { id: 'usage', label: 'Product Usage', icon: FileText },
  { id: 'quality', label: 'Output Quality', icon: CheckCircle },
  { id: 'efficiency', label: 'Efficiency Gain', icon: Activity },
  { id: 'commercial', label: 'Commercial Readiness', icon: AlertTriangle },
] as const;

export default function ValidationDashboardPage() {
  const [data, setData] = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<'telemetry' | 'usage' | 'quality' | 'efficiency' | 'commercial'>('telemetry');

  useEffect(() => {
    if (loading || !data) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) {
          setActiveSection(visible.target.id as typeof activeSection);
        }
      },
      { rootMargin: '-18% 0px -68% 0px' }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [loading, data]);

  useEffect(() => {
    fetch(`/api/analytics/validation?demo=${demoMode}`)
      .then(res => {
        if (res.status === 401) {
          router.replace('/login');
          return null;
        }
        if (res.status === 403) {
          router.replace('/dashboard');
          return null;
        }
        if (res.status === 409) {
          router.replace('/onboarding');
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch validation report');
        return res.json();
      })
      .then(d => {
        if (!d) return;
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [router, demoMode]);

  const toggleDemoMode = () => {
    setLoading(true);
    setDemoMode(current => !current);
  };

  const handleDownloadCSV = () => {
    if (!data || !data.validationReport) return;

    let csvContent = "Category,Metric Label,Current Value,Target Value,Status\n";
    
    Object.entries(data.validationReport).forEach(([categoryKey, category]) => {
      const categoryLabel = categoryKey
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
        
      Object.values(category).forEach((metric) => {
        const statusInfo = getMetricStatus(metric);
        const formattedCurrent = formatMetricValue(metric.current, metric);
        const formattedTarget = formatMetricValue(metric.target, metric);
        
        const categoryEscaped = `"${categoryLabel.replace(/"/g, '""')}"`;
        const labelEscaped = `"${metric.label.replace(/"/g, '""')}"`;
        const currentEscaped = `"${formattedCurrent.replace(/"/g, '""')}"`;
        const targetEscaped = `"${formattedTarget.replace(/"/g, '""')}"`;
        const statusEscaped = `"${statusInfo.label.replace(/"/g, '""')}"`;
        
        csvContent += `${categoryEscaped},${labelEscaped},${currentEscaped},${targetEscaped},${statusEscaped}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `eai_validation_report_${demoMode ? 'demo' : 'real'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getProgressPercentage = (metric: MetricDetail) => {
    if (metric.isReverse) {
      if (metric.current <= metric.target) return 100;
      return Math.max(10, Math.min(100, Math.round((metric.target / metric.current) * 100)));
    }
    return Math.min(100, Math.round((metric.current / metric.target) * 100));
  };

  const getMetricStatus = (metric: MetricDetail) => {
    const current = metric.current;
    const target = metric.target;
    
    if (metric.isReverse) {
      if (current <= target) return { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:border-emerald-500/30', label: 'Met' };
      if (current <= target * 1.5) return { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 dark:border-amber-500/30', label: 'Developing' };
      return { color: 'bg-rose-500/10 text-rose-500 border-rose-500/20 dark:border-rose-500/30', label: 'At Risk' };
    } else {
      if (current >= target) return { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:border-emerald-500/30', label: 'Met' };
      if (current >= target * 0.7) return { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 dark:border-amber-500/30', label: 'Developing' };
      return { color: 'bg-rose-500/10 text-rose-500 border-rose-500/20 dark:border-rose-500/30', label: 'At Risk' };
    }
  };

  const formatMetricValue = (val: number, metric: MetricDetail) => {
    if (metric.isPercentage) return `${val}%`;
    if (metric.isDuration) return `${val} mins`;
    if (metric.isCurrency) {
      if (metric.isUsd) {
        return `$${val.toFixed(3)}`;
      }
      if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`;
      return `Rp ${val.toLocaleString('id-ID')}`;
    }
    return val.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <WorkspacePageShell
      title="Product Validation Report"
      description="Investor-grade metrics &amp; validation KPIs (Internal · Owner Only)"
      currentPage="dashboard"
      actions={
        <div className="flex items-center gap-2">
          {/* Demo Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 shadow-sm transition-all">
            <span className="text-[10px] font-semibold text-muted-foreground">Demo</span>
            <button
              onClick={toggleDemoMode}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                demoMode ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
              }`}
              role="switch"
              aria-checked={demoMode}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  demoMode ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Download CSV Button */}
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 rounded-full text-xs font-semibold transition-all shadow-sm cursor-pointer text-foreground"
            aria-label="Download Report as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <Link
            href="/settings/billing"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 rounded-full text-xs font-semibold transition-all shadow-sm"
          >
            <WalletCards className="w-3.5 h-3.5" />
            <span>Billing Admin</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 rounded-full text-xs font-semibold transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      }
      sidebar={
        <>
          <div className="settings-page-account">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface-2)] text-xs font-semibold">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">Validation Report</div>
              <div className="truncate text-[11px] text-[var(--muted-foreground)]">owner authorization active</div>
            </div>
          </div>

          <nav aria-label="Validation sections" className="settings-page-nav">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  data-active={activeSection === section.id}
                  aria-current={activeSection === section.id ? 'location' : undefined}
                  onClick={() => setActiveSection(section.id)}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </a>
              );
            })}
          </nav>
        </>
      }
    >
      <div className="settings-page-content scroll-y-auto">
        <div className="settings-page-intro">
          <span>Validation Report</span>
          <h2>Investor-grade metrics &amp; validation KPIs</h2>
          <p>
            Review the EAI platform efficiency gains, usage validation, cost metrics, and commercial readiness levels.
          </p>
        </div>

        {/* Telemetry Summary Banner */}
        {data.telemetrySummary && (
          <div id="telemetry" className="scroll-mt-6 mb-8 bg-gradient-to-r from-primary-500/5 to-indigo-500/5 dark:from-primary-500/10 dark:to-indigo-500/10 border border-primary-500/10 dark:border-primary-500/20 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> System Telemetry Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tracked Outputs</span>
                <span className="block text-xl font-bold mt-1 text-foreground">{data.telemetrySummary.trackedOutputs}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Telemetry Coverage</span>
                <span className="block text-xl font-bold mt-1 text-foreground">{data.telemetrySummary.coveragePercentage}%</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Est. Cost</span>
                <span className="block text-xl font-bold mt-1 text-foreground">Rp {data.telemetrySummary.totalEstimatedCostIdr.toLocaleString('id-ID')}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tokens (In / Out)</span>
                <span className="block text-sm font-bold mt-2 text-foreground truncate">
                  {(data.telemetrySummary.totalInputTokens / 1000).toFixed(0)}k / {(data.telemetrySummary.totalOutputTokens / 1000).toFixed(0)}k
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Product Usage Card */}
          <div id="usage" className="scroll-mt-6 bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl p-6 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md">
            <div>
              <h3 className="text-lg font-bold font-serif mb-5 text-foreground flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/70 pb-3">
                <FileText className="w-5 h-5 text-primary" /> Product Usage
              </h3>
              <div className="space-y-6">
                {Object.entries(data.validationReport.productUsage).map(([key, metric]) => {
                  const status = getMetricStatus(metric);
                  const progress = getProgressPercentage(metric);
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wider">{metric.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-bold text-foreground">
                          {formatMetricValue(metric.current, metric)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Target: {formatMetricValue(metric.target, metric)}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-950/80 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            status.label === 'Met' ? 'bg-emerald-500' : status.label === 'Developing' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Output Quality Card */}
          <div id="quality" className="scroll-mt-6 bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl p-6 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md">
            <div>
              <h3 className="text-lg font-bold font-serif mb-5 text-foreground flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/70 pb-3">
                <CheckCircle className="w-5 h-5 text-emerald-500" /> Output Quality
              </h3>
              <div className="space-y-6">
                {Object.entries(data.validationReport.outputQuality).map(([key, metric]) => {
                  const status = getMetricStatus(metric);
                  const progress = getProgressPercentage(metric);
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wider">{metric.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-bold text-foreground">
                          {formatMetricValue(metric.current, metric)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Target: {formatMetricValue(metric.target, metric)}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-950/80 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            status.label === 'Met' ? 'bg-emerald-500' : status.label === 'Developing' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Efficiency Gain Card */}
          <div id="efficiency" className="scroll-mt-6 bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl p-6 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md">
            <div>
              <h3 className="text-lg font-bold font-serif mb-5 text-foreground flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/70 pb-3">
                <Activity className="w-5 h-5 text-indigo-500" /> Efficiency Gain
              </h3>
              <div className="space-y-6">
                {Object.entries(data.validationReport.efficiencyGain).map(([key, metric]) => {
                  const status = getMetricStatus(metric);
                  const progress = getProgressPercentage(metric);
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                          {metric.label}
                          {metric.coverage !== undefined && (
                            <span className="block mt-0.5 text-[9px] normal-case tracking-normal font-medium text-muted-foreground">
                              {metric.coverage}% outputs tracked
                            </span>
                          )}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-bold text-foreground">
                          {formatMetricValue(metric.current, metric)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Target: {formatMetricValue(metric.target, metric)}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-950/80 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            status.label === 'Met' ? 'bg-emerald-500' : status.label === 'Developing' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Commercial Readiness Card */}
          <div id="commercial" className="scroll-mt-6 bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl p-6 shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md">
            <div>
              <h3 className="text-lg font-bold font-serif mb-5 text-foreground flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/70 pb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Commercial Readiness
              </h3>
              <div className="space-y-6">
                {Object.entries(data.validationReport.commercialReadiness).map(([key, metric]) => {
                  const status = getMetricStatus(metric);
                  const progress = getProgressPercentage(metric);
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wider">{metric.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-bold text-foreground">
                          {formatMetricValue(metric.current, metric)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Target: {formatMetricValue(metric.target, metric)}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-950/80 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            status.label === 'Met' ? 'bg-emerald-500' : status.label === 'Developing' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkspacePageShell>
  );
}
