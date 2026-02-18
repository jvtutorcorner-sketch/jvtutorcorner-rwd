"use client";

import React, { useState } from 'react';
import { COURSES } from '@/data/courses';

// 定義退款政策/設定的型別
type RefundPolicy = {
  id: string;
  name: string;
  reason: string;
  refundPercentage: number; // 退款百分比 (1-100)
  note?: string;
};

type RefundLog = {
  id: string;
  operator: string;
  timestamp: string;
  target: string;
  condition: string;
  policyName: string;
  amount: number;
};

// 假資料: 預設的退款設定
const DEFAULT_POLICIES: RefundPolicy[] = [
  { id: 'p1', name: '全額退款 (誤報已修正)', reason: 'User mistaken / Correction', refundPercentage: 100 },
  { id: 'p2', name: '課程取消補償', reason: 'Course Cancelled', refundPercentage: 100, note: '包含補償學分' },
  { id: 'p3', name: '7天猶豫期退款', reason: '7-day Policy', refundPercentage: 100 },
  { id: 'p4', name: '中途退課 (50%)', reason: 'User Quit (Halfway)', refundPercentage: 50 },
];

export default function RefundManagementPage() {
  // 1. 退款設定管理
  const [policies, setPolicies] = useState<RefundPolicy[]>(DEFAULT_POLICIES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyReason, setNewPolicyReason] = useState('');
  const [newPolicyPercent, setNewPolicyPercent] = useState<number>(100);

  // 2. 退款執行
  const [targetOrderId, setTargetOrderId] = useState('');
  const [targetCourseId, setTargetCourseId] = useState('');
  const [targetPlan, setTargetPlan] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  
  const [processing, setProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // 3. 退款紀錄
  const [refundLogs, setRefundLogs] = useState<RefundLog[]>([]);

  // 新增或更新退款設定
  const handleSavePolicy = () => {
    if (!newPolicyName || !newPolicyReason) {
      alert('請填寫完整設定名稱與原因');
      return;
    }

    if (editingId) {
      // 更新
      setPolicies(prev => prev.map(p => p.id === editingId ? {
        ...p,
        name: newPolicyName,
        reason: newPolicyReason,
        refundPercentage: Number(newPolicyPercent)
      } : p));
      setEditingId(null);
    } else {
      // 新增
      const newPolicy: RefundPolicy = {
        id: `p${Date.now()}`,
        name: newPolicyName,
        reason: newPolicyReason,
        refundPercentage: Number(newPolicyPercent),
      };
      setPolicies([...policies, newPolicy]);
    }

    setNewPolicyName('');
    setNewPolicyReason('');
    setNewPolicyPercent(100);
  };

  const handleStartEdit = (p: RefundPolicy) => {
    setEditingId(p.id);
    setNewPolicyName(p.name);
    setNewPolicyReason(p.reason);
    setNewPolicyPercent(p.refundPercentage);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewPolicyName('');
    setNewPolicyReason('');
    setNewPolicyPercent(100);
  };

  // 執行退款 (模擬)
  const handleExecuteRefund = async () => {
    if (!targetOrderId && !targetCourseId && !targetPlan) {
      alert('請輸入單一訂單 ID，或選擇課程/方案');
      return;
    }
    // 時間區間檢查 (如果是單一訂單則免填日期，否則要填)
    if (!targetOrderId && (!startDate || !endDate)) {
      alert('批次操作請設定開始與結束時間區間');
      return;
    }
    if (!selectedPolicyId) {
      alert('請選擇要套用的退款規則');
      return;
    }

    const policy = policies.find(p => p.id === selectedPolicyId);
    const ok = confirm(`確定要執行退款嗎？\n規則：${policy?.name} (${policy?.refundPercentage}%)\n此操作將會產生退款單據。`);
    if (!ok) return;

    setProcessing(true);
    setResultMessage(null);

    // 模擬 API 呼叫延遲
    await new Promise(r => setTimeout(r, 1500));

    // 模擬結果與卡控邏輯
    let targetName = '';
    let mockCount = 0;
    let skippedCount = 0;

    if (targetOrderId) {
      targetName = `單一訂單 (ID: ${targetOrderId})`;
      // 模擬卡控：隨機判斷該訂單是否已付款 (80% 成功率)
      const isPaid = Math.random() > 0.2;
      if (!isPaid) {
        setResultMessage(`
          執行失敗！
          --------------------------------
          目標訂單: ${targetOrderId}
          原因: 此訂單狀態為「未付款」或「已取消」，無法執行退款卡控。
          --------------------------------
          狀態: 終止操作
        `);
        setProcessing(false);
        return;
      }
      mockCount = 1;
    } else {
      targetName = targetCourseId 
        ? COURSES.find(c => c.id === targetCourseId)?.title || '未知課程'
        : `方案 ${targetPlan}`;
      
      // 模擬批次篩選中的付款狀態卡控
      const totalFound = Math.floor(Math.random() * 8) + 2; 
      mockCount = Math.max(1, Math.floor(totalFound * 0.7)); // 假設 70% 是已付款
      skippedCount = totalFound - mockCount;
    }

    setResultMessage(`
      成功執行！ (付款狀態卡控通過)
      --------------------------------
      目標對象: ${targetName}
      ${targetOrderId ? '' : `時間區間: ${startDate} ~ ${endDate}`}
      套用設定: ${policy?.name} (${policy?.refundPercentage}%)
      --------------------------------
      ✅ 處理退款數: ${mockCount} 筆
      ${skippedCount > 0 ? `⚠️ 跳過未付款數: ${skippedCount} 筆 (自動過濾)` : ''}
      狀態: 已建立退款單，進入待審核流程
    `);

    // 加入紀錄
    const newLog: RefundLog = {
      id: `log-${Date.now()}`,
      operator: 'Admin (Demo)', // 實際應從 Auth Context 取得
      timestamp: new Date().toLocaleString(),
      target: targetName,
      condition: targetOrderId ? `單一訂單: ${targetOrderId}` : `${startDate} ~ ${endDate}`,
      policyName: policy?.name || '未知',
      amount: mockCount
    };
    setRefundLogs(prev => [newLog, ...prev]);

    setProcessing(false);
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-[1600px]">
      <h1 className="text-3xl font-bold mb-6">退款管理 (Refund Management)</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          {/* 區塊 1: 退款設定管理 */}
          <section className="bg-white p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">
              1. 常用退款設定 {editingId ? <span className="text-blue-600">(編輯中)</span> : '(Settings)'}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700">設定名稱</label>
                <input 
                  className="mt-1 block w-full border rounded px-3 py-2"
                  placeholder="e.g. 報名費用退還"
                  value={newPolicyName}
                  onChange={e => setNewPolicyName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">原因 / 備註</label>
                <input 
                  className="mt-1 block w-full border rounded px-3 py-2"
                  placeholder="Internal Note"
                  value={newPolicyReason}
                  onChange={e => setNewPolicyReason(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">退款比例 %</label>
                <input 
                  type="number"
                  min="0"
                  max="100"
                  className="mt-1 block w-full border rounded px-3 py-2"
                  value={newPolicyPercent}
                  onChange={e => setNewPolicyPercent(Number(e.target.value))}
                />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <button 
                  onClick={handleSavePolicy}
                  className={`${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} text-white px-4 py-2 rounded flex-1 transition`}
                >
                  {editingId ? '儲存修改' : '+ 新增設定'}
                </button>
                {editingId && (
                  <button 
                    onClick={handleCancelEdit}
                    className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500 transition"
                  >
                    取消
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="px-4 py-2">名稱</th>
                    <th className="px-4 py-2">原因</th>
                    <th className="px-4 py-2">比例</th>
                    <th className="px-4 py-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {policies.map(p => (
                    <tr key={p.id} className={editingId === p.id ? 'bg-blue-50' : ''}>
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2 text-gray-500">{p.reason}</td>
                      <td className="px-4 py-2 font-bold">{p.refundPercentage}%</td>
                      <td className="px-4 py-2">
                        <button 
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-4"
                          onClick={() => handleStartEdit(p)}
                        >
                          編輯
                        </button>
                        <button 
                          className="text-red-500 hover:text-red-700 text-sm"
                          onClick={() => setPolicies(policies.filter(x => x.id !== p.id))}
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 區塊 2: 執行操作 */}
          <section className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">2. 批次退款執行 (自動卡控已付款訂單)</h2>
            <p className="text-gray-500 mb-6 text-sm">
              請選擇目標課程或方案，並指定訂單成立的時間區間。
            </p>

            <div className="space-y-6 max-w-2xl">
              {/* 左側：條件選擇 */}
              <div className="space-y-6">
                <div className="bg-blue-50 p-5 rounded-lg border border-blue-200 shadow-sm">
                  <label className="block text-sm font-bold text-blue-800 mb-1">方式 A：指定單一訂單 (Order ID)</label>
                  <input 
                    className="w-full border rounded px-3 py-2 bg-white"
                    placeholder="輸入完整訂單 ID (例如: ord-12345)"
                    value={targetOrderId}
                    onChange={e => {
                      setTargetOrderId(e.target.value);
                      if (e.target.value) {
                        setTargetCourseId('');
                        setTargetPlan('');
                      }
                    }}
                  />
                </div>

                <div className="text-center text-gray-400 text-sm">- 或 -</div>

                <div className={`p-4 rounded border ${targetOrderId ? 'bg-gray-50 opacity-50' : 'bg-gray-50 border-gray-200'}`}>
                  <label className="block text-sm font-bold text-gray-700 mb-2">方式 B：批次篩選條件</label>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">目標課程 (Course)</label>
                      <select 
                        className="w-full border rounded px-3 py-2 bg-white"
                        disabled={!!targetOrderId}
                        value={targetCourseId}
                        onChange={e => { setTargetCourseId(e.target.value); setTargetPlan(''); }}
                      >
                        <option value="">-- 請選擇課程 --</option>
                        {COURSES.map(c => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </select>
                    </div>

                    <div className="text-center text-gray-400 text-xs">AND</div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">目標方案 (Membership Plan)</label>
                      <select 
                        className="w-full border rounded px-3 py-2 bg-white"
                        disabled={!!targetOrderId}
                        value={targetPlan}
                        onChange={e => { setTargetPlan(e.target.value); setTargetCourseId(''); }}
                      >
                        <option value="">-- 不指定方案 --</option>
                        <option value="basic">Basic Plan</option>
                        <option value="pro">Pro Plan</option>
                        <option value="elite">Elite Plan</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">訂單日期區間</label>
                      <div className="flex gap-2">
                        <input 
                          type="date" 
                          className="flex-1 border rounded px-3 py-2"
                          disabled={!!targetOrderId}
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                        />
                        <span className="self-center">至</span>
                        <input 
                          type="date" 
                          className="flex-1 border rounded px-3 py-2"
                          disabled={!!targetOrderId}
                          value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">套用設定 (Apply Policy)</label>
                  <select 
                    className="w-full border rounded px-3 py-2 bg-white border-blue-300"
                    value={selectedPolicyId}
                    onChange={e => setSelectedPolicyId(e.target.value)}
                  >
                    <option value="">-- 請選擇退款規則 --</option>
                    {policies.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.refundPercentage}%)</option>
                    ))}
                  </select>
                </div>

                <button 
                  className={`w-full py-3 rounded text-white font-bold text-lg mt-4 
                    ${processing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                  `}
                  onClick={handleExecuteRefund}
                  disabled={processing}
                >
                  {processing ? '處理中...' : '執行退款'}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* 右側：退款紀錄 */}
        <div className="lg:col-span-2">
          <section className="bg-white p-6 rounded-lg shadow h-full flex flex-col">
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">退款紀錄 (History)</h2>
            <div className="flex-1 overflow-y-auto space-y-4 max-h-[800px] pr-2">
              {refundLogs.length === 0 ? (
                <div className="text-center py-10 text-gray-400">尚無紀錄</div>
              ) : (
                refundLogs.map(log => (
                  <div key={log.id} className="border rounded-lg p-4 text-sm bg-gray-50 transition hover:shadow-md">
                    <div className="flex justify-between items-start mb-2">
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-medium">#{log.amount} 筆</span>
                      <span className="text-gray-400 text-xs">{log.timestamp}</span>
                    </div>
                    <div className="space-y-1">
                      <p><strong>人員：</strong> {log.operator}</p>
                      <p><strong>對象：</strong> {log.target}</p>
                      <p><strong>條件：</strong> <code className="bg-gray-200 px-1 rounded text-xs">{log.condition}</code></p>
                      <p><strong>規則：</strong> {log.policyName}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
