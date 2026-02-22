'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GA_MEASUREMENT_ID } from '@/lib/gtag';

// Mock Data for Visualization
const MOCK_TRAFFIC_DATA = [
  { date: 'Mon', users: 120, sessions: 154 },
  { date: 'Tue', users: 132, sessions: 160 },
  { date: 'Wed', users: 101, sessions: 120 },
  { date: 'Thu', users: 134, sessions: 145 },
  { date: 'Fri', users: 190, sessions: 230 },
  { date: 'Sat', users: 230, sessions: 280 },
  { date: 'Sun', users: 210, sessions: 250 },
];

const TOP_PAGES = [
  { path: '/', title: '首頁 | JVTutor', views: 1205 },
  { path: '/courses', title: '熱門課程', views: 850 },
  { path: '/teachers', title: '找老師', views: 640 },
  { path: '/login', title: '會員登入', views: 320 },
  { path: '/about', title: '關於我們', views: 150 },
];

const REGIONS = [
  { country: 'Taiwan', users: 850, percent: 70 },
  { country: 'Hong Kong', users: 120, percent: 10 },
  { country: 'USA', users: 85, percent: 7 },
  { country: 'Japan', users: 60, percent: 5 },
  { country: 'Others', users: 100, percent: 8 },
];

// Simple Bar Chart Component (SVG)
const SimpleBarChart = ({ data }: { data: any[] }) => {
  const max = Math.max(...data.map(d => d.sessions));
  const height = 150;
  const width = 100;
  const barWidth = 6;
  const gap = 4;

  return (
    <div className="flex items-end justify-between h-[150px] w-full gap-2 pt-4">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center group flex-1">
          <div className="relative w-full flex justify-center items-end h-full">
            <div
              style={{ height: `${(d.sessions / max) * 100}%` }}
              className="w-full max-w-[24px] bg-blue-500 rounded-t-sm group-hover:bg-blue-600 transition-all opacity-80"
            ></div>
            {/* Tooltip */}
            <div className="absolute -top-8 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {d.sessions} Sessions
            </div>
          </div>
          <span className="text-xs text-gray-400 mt-2">{d.date}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('7d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  return (
    <main className="p-8 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-orange-500">📊</span> 網站流量分析 (GA4)
          </h1>
          <p className="text-gray-500 mt-1">Real-time visualization of user behavior and traffic sources.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-3 py-1 rounded border border-gray-200 text-xs text-gray-500 hidden xl:block">
            Measurement ID: <span className="font-mono font-medium text-gray-800">{String(process.env.NEXT_PUBLIC_GA_ID || 'G-XXXXXXXXXX')}</span>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-2 py-1 shadow-sm">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-sm text-gray-700 border-none p-0 focus:ring-0 w-32 outline-none"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-sm text-gray-700 border-none p-0 focus:ring-0 w-32 outline-none"
              />
            </div>
          )}

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 py-2 px-3 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="7d">過去 7 天 (Last 7 Days)</option>
            <option value="30d">過去 30 天 (Last 30 Days)</option>
            <option value="90d">過去 90 天 (Last 3 Months)</option>
            <option value="custom">自訂區間 (Custom Range)</option>
          </select>
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 whitespace-nowrap text-sm font-medium">
            &larr; 返回
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 font-medium uppercase">Active Users</p>
          <div className="flex items-end gap-2 mt-2">
            <h3 className="text-3xl font-bold text-gray-800">1,248</h3>
            <span className="text-green-500 text-sm font-medium mb-1">↑ 12%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">vs previous 7 days</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 font-medium uppercase">New Users</p>
          <div className="flex items-end gap-2 mt-2">
            <h3 className="text-3xl font-bold text-gray-800">854</h3>
            <span className="text-green-500 text-sm font-medium mb-1">↑ 5.3%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">First time visitors</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 font-medium uppercase">Engagement Rate</p>
          <div className="flex items-end gap-2 mt-2">
            <h3 className="text-3xl font-bold text-gray-800">62.8%</h3>
            <span className="text-red-500 text-sm font-medium mb-1">↓ 1.2%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Sessions lasted {'>'} 10s</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 font-medium uppercase">Avg. Engagement Time</p>
          <div className="flex items-end gap-2 mt-2">
            <h3 className="text-3xl font-bold text-gray-800">4m 32s</h3>
            <span className="text-green-500 text-sm font-medium mb-1">↑ 20s</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Per active user</p>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Traffic Overview */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-800">流量趨勢 (User Activity)</h3>
            <button className="text-sm text-blue-500 hover:text-blue-700">View Report</button>
          </div>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded border border-gray-100/50 p-4">
            {/* Built-in simple chart */}
            <SimpleBarChart data={MOCK_TRAFFIC_DATA} />
          </div>
        </div>

        {/* Realtime / Top Geographics */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 mb-6">訪客來源地區</h3>
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              {REGIONS.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {r.country.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{r.country}</span>
                      <span className="text-sm text-gray-500">{r.users}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${r.percent}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <Link href="https://analytics.google.com/" target="_blank" className="text-sm text-blue-500 hover:text-blue-700 flex items-center justify-center gap-1">
              前往 Google Analytics 查看詳情 ↗
            </Link>
          </div>
        </div>
      </div>

      {/* Top Pages Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-gray-700">熱門瀏覽頁面</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 font-medium">Page Title</th>
                <th className="px-6 py-3 font-medium">Path</th>
                <th className="px-6 py-3 font-medium text-right">Views</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TOP_PAGES.map((page, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-800">{page.title}</td>
                  <td className="px-6 py-4 text-blue-600 font-mono text-xs">{page.path}</td>
                  <td className="px-6 py-4 text-right">{page.views.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
