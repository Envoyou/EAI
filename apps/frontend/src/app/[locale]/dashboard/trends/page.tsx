'use client';

import React from 'react';
import { Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  LineChart, Line, PieChart, Pie, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import { useDashboard } from '@/components/DashboardProvider';

export default function TrendsPage() {
  const { data } = useDashboard();

  if (!data) return null;

  return (
    <section id="trends" className="settings-page-section">
      <div className="settings-page-section-heading">
        <h2>Trends &amp; Verdicts</h2>
        <p>Ready rate timeline, verdict split, and common flags.</p>
      </div>
      <div className="settings-page-section-body py-6 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend Chart */}
          <div className="lg:col-span-2 bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-6 shadow-sm min-w-0">
            <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-foreground">
              <Activity className="w-5 h-5 text-primary" /> Daily Ready Rate
            </h3>
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={300} debounce={50}>
                <LineChart data={data.trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888822" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} dy={10} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} dx={-10} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="readyRate" name="Ready Rate" unit="%" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: 'var(--card)' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Readiness Pie Chart */}
          <div className="bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-6 shadow-sm flex flex-col justify-between min-w-0">
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
                <CheckCircle className="w-5 h-5 text-primary" /> Readiness Breakdown
              </h3>
            </div>
            <div className="h-[250px] w-full flex items-center justify-center relative min-w-0">
              <ResponsiveContainer width="100%" height={250} debounce={50}>
                <PieChart>
                  <Pie
                    data={data.verdictData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {data.verdictData.map((entry, index) => {
                      const getVerdictColor = (name: string) => {
                        const n = name.toLowerCase();
                        if (n === 'ready') return '#10b981';
                        if (n === 'needs review') return '#f59e0b';
                        if (n === 'blocked') return '#ef4444';
                        return '#64748b';
                      };
                      return (
                        <Cell key={`cell-${index}`} fill={getVerdictColor(entry.name)} />
                      );
                    })}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {data.verdictData.map((v) => {
                const getVerdictColor = (name: string) => {
                  const n = name.toLowerCase();
                  if (n === 'ready') return '#10b981';
                  if (n === 'needs review') return '#f59e0b';
                  if (n === 'blocked') return '#ef4444';
                  return '#64748b';
                };
                return (
                  <div key={v.name} className="flex items-center gap-1.5 text-xs font-semibold capitalize">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getVerdictColor(v.name) }} />
                    {v.name}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Flags Bar Chart */}
          <div className="lg:col-span-3 bg-white/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-6 shadow-sm min-w-0">
            <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-primary" /> Top Flags
            </h3>
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={300} debounce={50}>
                <BarChart data={data.flagsData} layout="vertical" margin={{ left: 50, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#88888822" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} width={150} />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" name="Count" fill="#f59e0b" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
