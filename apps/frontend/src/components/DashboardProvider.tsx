'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AnalyticsData {
  totalLogs: number;
  readyRate: number;
  trendData: { date: string; readyRate: number }[];
  verdictData: { name: string; value: number; fill: string }[];
  flagsData: { name: string; count: number }[];
  draftsThisMonth: number;
  polishedRate: number;
  seoCompletionRate: number;
  povMatchRate: number;
  publishableRate: number;
  cmsExportSuccessRate: number;
  avgArticlesPerUser: number;
  userBreakdown: {
    userId: string;
    name: string;
    email: string;
    imageUrl: string;
    logsCount: number;
    readyRate: number;
    avgRevisions: number;
  }[];
  avgTimeToPublish: number;
  avgRevisionsPerArticle: number;
  categoryBreakdown: { name: string; count: number }[];
  periodComparison: {
    totalLogsChange: number;
    readyRateChange: number;
    flagsChange: number;
  };
}

interface DashboardContextValue {
  data: AnalyticsData | null;
  loading: boolean;
  timeRange: string;
  setTimeRange: (range: string) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
  handleDownloadCSV: () => void;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<string>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const router = useRouter();

  const updateTimeRange = (range: string) => {
    setLoading(true);
    setTimeRange(range);
  };

  const updateCustomStartDate = (date: string) => {
    setLoading(true);
    setCustomStartDate(date);
  };

  const updateCustomEndDate = (date: string) => {
    setLoading(true);
    setCustomEndDate(date);
  };

  useEffect(() => {
    let url = `/api/analytics?range=${timeRange}`;
    if (timeRange === 'custom') {
      if (customStartDate) url += `&startDate=${customStartDate}`;
      if (customEndDate) url += `&endDate=${customEndDate}`;
    }

    fetch(url)
      .then(res => {
        if (res.status === 401) {
          router.replace('/login');
          return null;
        }
        if (res.status === 409) {
          router.replace('/onboarding');
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch analytics');
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
  }, [router, timeRange, customStartDate, customEndDate]);

  const handleDownloadCSV = () => {
    if (!data) return;

    let csvContent = "Report Type,Data Key,Value/Count\n";
    csvContent += `Summary,Total Reviews,${data.totalLogs}\n`;
    csvContent += `Summary,Ready Rate,${data.readyRate}%\n`;
    csvContent += `Summary,Total Flags,${data.flagsData.reduce((acc, curr) => acc + curr.count, 0)}\n\n`;
    
    csvContent += `Performance,Drafts processed,${data.draftsThisMonth}\n`;
    csvContent += `Performance,Completion rate,${data.polishedRate}%\n`;
    csvContent += `Performance,SEO pack completion,${data.seoCompletionRate}%\n`;
    csvContent += `Performance,Voice match rate,${data.povMatchRate}%\n`;
    csvContent += `Performance,Directly publishable,${data.publishableRate}%\n`;
    csvContent += `Performance,CMS export success,${data.cmsExportSuccessRate}%\n`;
    csvContent += `Performance,Avg. articles per user,${data.avgArticlesPerUser}\n`;
    csvContent += `Performance,Avg. time to publish,${data.avgTimeToPublish} mins\n`;
    csvContent += `Performance,Avg. revisions per article,${data.avgRevisionsPerArticle}\n\n`;
    
    csvContent += "Daily Ready Rate,Date,Ready Rate\n";
    data.trendData.forEach(item => {
      csvContent += `Daily Ready Rate,${item.date},${item.readyRate}%\n`;
    });
    csvContent += "\n";
    
    csvContent += "Verdict Breakdown,Verdict,Count\n";
    data.verdictData.forEach(item => {
      csvContent += `Verdict Breakdown,${item.name},${item.value}\n`;
    });
    csvContent += "\n";
    
    csvContent += "Top Flags,Warning Name,Count\n";
    data.flagsData.forEach(item => {
      csvContent += `Top Flags,"${item.name.replace(/"/g, '""')}",${item.count}\n`;
    });
    csvContent += "\n";

    csvContent += "Category Distribution,Category,Article Count\n";
    data.categoryBreakdown.forEach(item => {
      csvContent += `Category Distribution,"${item.name.replace(/"/g, '""')}",${item.count}\n`;
    });
    csvContent += "\n";

    csvContent += "Editor Performance,Name,Email,Logs Count,Ready Rate,Avg Revisions\n";
    data.userBreakdown.forEach(user => {
      csvContent += `Editor Performance,"${user.name.replace(/"/g, '""')}","${user.email.replace(/"/g, '""')}",${user.logsCount},${user.readyRate}%,${user.avgRevisions}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "eai_editorial_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardContext.Provider value={{
      data,
      loading,
      timeRange,
      setTimeRange: updateTimeRange,
      customStartDate,
      setCustomStartDate: updateCustomStartDate,
      customEndDate,
      setCustomEndDate: updateCustomEndDate,
      handleDownloadCSV
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
