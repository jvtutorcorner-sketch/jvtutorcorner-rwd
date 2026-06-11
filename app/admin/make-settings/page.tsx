"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface MakeConfigStatus {
  configured: boolean;
  source: 'db' | 'env' | 'unset';
  updatedAt: string | null;
  webhookUrlPreview: string | null;
}

export default function MakeSettingsPage() {
  const [status, setStatus] = useState<MakeConfigStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/integration/make-config')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setStatus(data);
      })
      .catch(() => {});
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async () => {
    if (!webhookUrl) return;
    setSaving(true);
    try {
      const res = await fetch('/api/integration/make-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, webhookSecret: webhookSecret || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage('success', 'Webhook URL 已儲存');
        setWebhookUrl('');
        setWebhookSecret('');
        // Refresh status
        const refreshed = await fetch('/api/integration/make-config').then(r => r.json());
        if (!refreshed.error) setStatus(refreshed);
      } else {
        showMessage('error', data.error || '儲存失敗');
      }
    } catch {
      showMessage('error', '網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleHealthCheck = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/integration/make-sync?health=true');
      const data = await res.json();
      if (data.ok) {
        showMessage('success', '健康檢查成功 ✓ Make.com webhook 可以連線');
      } else {
        showMessage('error', `健康檢查失敗：${data.reason || '未知錯誤'}`);
      }
    } catch {
      showMessage('error', '健康檢查請求失敗');
    } finally {
      setTesting(false);
    }
  };

  const handleBulkSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/integration/make-sync?type=questionnaires&maxItems=50', {
        method: 'PUT',
      });
      const data = await res.json();
      if (res.ok) {
        showMessage('success', `同步完成：已推送 ${data.sent} 筆問卷資料`);
      } else {
        showMessage('error', data.error || '同步失敗');
      }
    } catch {
      showMessage('error', '同步請求失敗');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← 管理後台</Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-800">Make.com 串接設定</h1>
          <p className="text-sm text-gray-500 mt-1">設定 Make.com Webhook URL 以啟用自動化流程串接</p>
        </div>

        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Current status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">目前狀態</h2>
          {status ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${status.configured ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-gray-600">
                  {status.configured ? '已設定' : '尚未設定'}
                </span>
                {status.source !== 'unset' && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    來源：{status.source === 'db' ? '資料庫' : '環境變數'}
                  </span>
                )}
              </div>
              {status.webhookUrlPreview && (
                <div className="text-gray-500 font-mono text-xs bg-gray-50 px-3 py-2 rounded">
                  {status.webhookUrlPreview}
                </div>
              )}
              {status.updatedAt && (
                <p className="text-gray-400 text-xs">
                  最後更新：{new Date(status.updatedAt).toLocaleString('zh-TW')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">載入中...</p>
          )}
        </div>

        {/* Set webhook URL */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-700">設定 Webhook URL</h2>
          <p className="text-xs text-gray-500">
            在 Make.com 建立 Scenario，加入 Webhook 模組，複製 URL 貼到下方。
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Webhook URL *</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://hook.eu1.make.com/xxxxx"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">HMAC Secret（選填）</label>
              <input
                type="password"
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                placeholder="用於驗證 Make.com 推入的資料簽章"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !webhookUrl}
              className="w-full py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-medium rounded-lg text-sm transition-colors"
            >
              {saving ? '儲存中...' : '儲存設定'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">操作</h2>
          <div className="space-y-2">
            <button
              onClick={handleHealthCheck}
              disabled={testing || !status?.configured}
              className="w-full py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {testing ? '測試中...' : '健康檢查（測試連線）'}
            </button>
            <button
              onClick={handleBulkSync}
              disabled={syncing || !status?.configured}
              className="w-full py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {syncing ? '同步中...' : '手動同步問卷資料到 Make.com'}
            </button>
          </div>
        </div>

        {/* Supported events */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">事件說明</h2>
          <div className="space-y-2 text-sm">
            {[
              ['QUESTIONNAIRE_SUBMITTED', '學生問卷提交', '問卷', '→ Make.com'],
              ['QUESTIONNAIRE_SYNC', '手動批次同步', '問卷', '→ Make.com'],
              ['HEALTH_CHECK', '連線測試', '系統', '→ Make.com'],
              ['TEACHER_RECOMMENDED', '老師推薦結果', 'Make.com', '→ 平台'],
              ['QUESTIONNAIRE_FOLLOWUP', '後續跟進通知', 'Make.com', '→ 平台'],
            ].map(([event, desc, from, direction]) => (
              <div key={event} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                <div>
                  <span className="font-mono text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">{event}</span>
                  <span className="ml-2 text-gray-600">{desc}</span>
                </div>
                <span className="text-xs text-gray-400">{from} {direction}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
