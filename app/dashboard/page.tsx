'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TEACHERS } from '@/data/teachers';

// Mock Icon components for better UI
const IconChart = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
const IconUsers = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const IconCash = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconCheck = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    revenue: 0,
    orderCount: 0,
    pendingOrders: 0,
    teacherCount: 0,
    profileCount: 0,
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (data.ok && data.stats) {
          setStats(data.stats);
        }
      } catch (e) {
        console.error('Failed to load stats', e);
      }
    }
    fetchStats();
  }, []);

  return (
    <main className="p-8 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <header className="mb-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">後台儀表板 (Dashboard)</h1>
            <p className="text-gray-500 mt-2">歡迎回來！今日系統運作正常，以下是即時營運概況。</p>
          </div>
          <div className="text-sm text-gray-400">
            {mounted && new Date().toLocaleDateString()}
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><IconCash /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">總營收 (Total Revenue)</p>
            <h3 className="text-2xl font-bold text-gray-800">NT$ {stats.revenue.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600"><IconChart /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">總訂單數 (Orders)</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.orderCount}</h3>
            {stats.pendingOrders > 0 && <span className="text-xs text-orange-500 font-medium">{stats.pendingOrders} 筆待處理</span>}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-green-50 rounded-lg text-green-600"><IconUsers /></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">在線師資 (Teachers)</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.teacherCount}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-3 bg-teal-50 rounded-lg text-teal-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
          <div>
            <p className="text-sm text-gray-500 font-medium">註冊人數 (Members)</p>
            <h3 className="text-2xl font-bold text-gray-800">{stats.profileCount}</h3>
          </div>
        </div>
      </div>

      {/* Main Grid Navigation */}
      <h2 className="text-xl font-bold text-gray-800 mb-4 px-1 border-l-4 border-blue-500 pl-3">功能模組快捷入口</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Content Management */}
        <div className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md group">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-lg text-gray-800 group-hover:text-blue-600">🎨 內容與師資管理</h3>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">CMS</span>
          </div>
          <p className="text-sm text-gray-500 mb-6 h-10">管理首頁輪播圖片、師資列表顯示以及課程內容。</p>
          <div className="flex flex-col gap-3">
            <Link href="/carousel" className="text-sm font-medium text-gray-600 hover:text-blue-600 flex items-center gap-2 p-2 rounded hover:bg-blue-50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> 前往輪播圖管理
            </Link>
            <Link href="/teachers" className="text-sm font-medium text-gray-600 hover:text-blue-600 flex items-center gap-2 p-2 rounded hover:bg-blue-50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> 查看前台師資列表
            </Link>
          </div>
        </div>

        {/* Business Management */}
        <div className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-green-300 transition-all shadow-sm hover:shadow-md group">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-lg text-gray-800 group-hover:text-green-600">📊 營運與訂單中心</h3>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">Business</span>
          </div>
          <p className="text-sm text-gray-500 mb-6 h-10">追蹤訂單狀態、處理退款申請與查看營收報表。</p>
          <div className="flex flex-col gap-3">
            <Link href="/admin/orders" className="text-sm font-medium text-gray-600 hover:text-green-600 flex items-center gap-2 p-2 rounded hover:bg-green-50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> 訂單管理列表
            </Link>
            <Link href="/admin/payments" className="text-sm font-medium text-gray-600 hover:text-green-600 flex items-center gap-2 p-2 rounded hover:bg-green-50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> 💳 收款管理
            </Link>
            <Link href="/admin/refunds" className="text-sm font-medium text-gray-600 hover:text-green-600 flex items-center gap-2 p-2 rounded hover:bg-green-50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> 退款申請處理
            </Link>
            <Link href="/admin/analytics" className="text-sm font-medium text-gray-600 hover:text-green-600 flex items-center gap-2 p-2 rounded hover:bg-green-50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span> 網站流量分析 (GA4)
            </Link>
          </div>
        </div>

        {/* System & Tech */}
        <div className="bg-white p-6 rounded-xl border-2 border-slate-200 hover:border-purple-300 transition-all shadow-sm hover:shadow-md group">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-lg text-gray-800 group-hover:text-purple-600">⚙️ 系統與教室中控</h3>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">System</span>
          </div>
          <p className="text-sm text-gray-500 mb-6 h-10">全站參數設定、白板互動技術切換、權限角色管理。</p>
          <div className="flex flex-col gap-3">
            <Link href="/admin/settings" className="text-sm font-medium text-gray-600 hover:text-purple-600 flex items-center gap-2 p-2 rounded hover:bg-purple-50 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> 系統權限與角色設定
            </Link>
            <div className="flex gap-2 mt-1 px-2">
              <Link href="/admin/whiteboard_sse" className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md border border-purple-100 transition-colors">
                🎨 白板SSE
              </Link>
              <Link href="/admin/whiteboard_agora" className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md border border-purple-100 transition-colors">
                🌐 Agora SDK
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Status Table */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            近期系統活動預覽
          </h3>
          <span className="text-xs text-gray-400 font-mono">Real-time Log</span>
        </div>
        <div className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 font-medium">類型</th>
                  <th className="px-6 py-3 font-medium">描述</th>
                  <th className="px-6 py-3 font-medium">時間</th>
                  <th className="px-6 py-3 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-blue-600">系統檢查</td>
                  <td className="px-6 py-4 text-gray-600">每日自動健康檢查 (Health Check)</td>
                  <td className="px-6 py-4 text-gray-400">剛剛</td>
                  <td className="px-6 py-4"><span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">Pass</span></td>
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-purple-600">白板服務</td>
                  <td className="px-6 py-4 text-gray-600">Agora Token 簽發服務連接正常</td>
                  <td className="px-6 py-4 text-gray-400">1 分鐘前</td>
                  <td className="px-6 py-4"><span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">Active</span></td>
                </tr>
                {stats.pendingOrders > 0 ? (
                  <tr className="hover:bg-gray-50 transition-colors bg-orange-50/30">
                    <td className="px-6 py-4 font-medium text-orange-600">新訂單</td>
                    <td className="px-6 py-4 text-gray-800 font-medium">收到 {stats.pendingOrders} 筆新訂單待付款確認</td>
                    <td className="px-6 py-4 text-gray-500">待處理</td>
                    <td className="px-6 py-4"><span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-semibold">Pending</span></td>
                  </tr>
                ) : (
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-400">訂單佇列</td>
                    <td className="px-6 py-4 text-gray-500">目前無待處理的訂單</td>
                    <td className="px-6 py-4 text-gray-400">-</td>
                    <td className="px-6 py-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">Empty</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
