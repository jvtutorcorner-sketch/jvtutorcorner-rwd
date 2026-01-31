'use client';

import React, { useState, useEffect } from 'react';

export default function WhiteboardAgoraAdminPage() {
  const [appId, setAppId] = useState('demo-agora-app-id');
  const [roomUuid, setRoomUuid] = useState('demo-room-uuid-12345');
  const [roomToken, setRoomToken] = useState('NETLESSSDK_Ym9...demo...token');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    // 模擬 API 儲存延遲
    await new Promise(r => setTimeout(r, 1000));
    setLastSaved(new Date().toLocaleTimeString());
    setIsSaving(false);
    alert('設定已儲存！ (模擬)');
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Agora 互動白板管理</h1>
          <p className="text-gray-500 mt-1">管理 Netless / Agora Whiteboard SDK 連線參數</p>
        </div>
        <div className="text-sm text-gray-400">
           系統狀態: <span className="text-green-500 font-bold">● 已連線</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* 主要設定卡片 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h2 className="font-bold text-gray-700">SDK 連線認證 (Credentials)</h2>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Agora App ID</label>
              <input 
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="例如: 1ddb2..."
              />
              <p className="mt-1 text-xs text-gray-400">從 Agora Console 取得的專案 App ID</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Room UUID</label>
              <input 
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition font-mono text-sm"
                value={roomUuid}
                onChange={(e) => setRoomUuid(e.target.value)}
                placeholder="例如: f182..."
              />
              <p className="mt-1 text-xs text-gray-400">Netless 白板房間識別碼</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Task Token / Room Token</label>
              <textarea 
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition font-mono text-sm h-24"
                value={roomToken}
                onChange={(e) => setRoomToken(e.target.value)}
                placeholder="NETLESSSDK_..."
              />
              <p className="mt-1 text-xs text-gray-400">用於進入房間的授權 Token (建議使用長期 Token 進行開發測試)</p>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {lastSaved && `最後儲存時間: ${lastSaved}`}
            </span>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className={`px-6 py-2 rounded-lg font-bold text-white transition shadow-sm ${
                isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
              }`}
            >
              {isSaving ? '儲存中...' : '更新連線參數'}
            </button>
          </div>
        </div>

        {/* 說明與診斷 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
            <h3 className="font-bold text-blue-800 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              使用說明
            </h3>
            <ul className="text-sm text-blue-700 space-y-2 list-disc pl-5">
              <li>此參數會影響全站所有預設使用 Agora 白板的教室。</li>
              <li>變更參數後，使用者需重新進入教室或重新整理頁面才會生效。</li>
              <li>Room Token 權限必須包含「寫入 (Admin)」或「讀寫」，否則白板將無法操作。</li>
            </ul>
          </div>

          <div className="bg-amber-50 p-6 rounded-xl border border-amber-100">
            <h3 className="font-bold text-amber-800 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              疑難排解 (Troubleshooting)
            </h3>
            <div className="text-sm text-amber-700 space-y-2">
              <p>● <strong>401 Unauthorized</strong>: 請檢查 Room Token 是否過期或 App ID 不匹配。</p>
              <p>● <strong>WebSocket Error</strong>: 請確認所在網路環境是否允許連接 `netless.io` 或 `agora.io` 的服務網域。</p>
              <p>● <strong>Region Conflict</strong>: 確保 SDK 初始化時的 `region` 設定（預設為 cn-hz 或 us-sv）與房間建立時一致。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

