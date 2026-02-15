'use client';

import React, { useState, useEffect } from 'react';

type AgoraLog = {
  id: string;
  timestamp: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  ua?: string;
  role?: 'teacher' | 'student';
  email?: string;
  session?: string;
  whiteboardUuid?: string;
};

export default function WhiteboardAgoraAdminPage() {
  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings');
  const [appId, setAppId] = useState('demo-agora-app-id');
  const [roomUuid, setRoomUuid] = useState('demo-room-uuid-12345');
  const [roomToken, setRoomToken] = useState('NETLESSSDK_Ym9...demo...token');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [agoraLogs, setAgoraLogs] = useState<AgoraLog[]>([
    {
      id: '1',
      timestamp: Date.now(),
      level: 'DEBUG',
      message: 'Connection established',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      role: 'teacher',
      email: 'teacher@example.com',
      session: 'sess_abc123def456',
      whiteboardUuid: 'wb_uuid_12345abc'
    }
  ]);
  const [selectedUALog, setSelectedUALog] = useState<AgoraLog | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logSubmitInput, setLogSubmitInput] = useState('');
  const [logSubmitRole, setLogSubmitRole] = useState<'teacher' | 'student'>('teacher');

  // Fetch logs from API
  const fetchLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const response = await fetch('/api/admin/agora-logs?limit=100&hoursAgo=24');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setAgoraLogs(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Fetch logs on component mount and every 5 seconds
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Submit a new log
  const handleSubmitLog = async () => {
    if (!logSubmitInput.trim()) return;

    try {
      const response = await fetch('/api/admin/agora-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: logSubmitInput,
          role: logSubmitRole,
          level: 'INFO',
        }),
      });

      if (response.ok) {
        setLogSubmitInput('');
        await fetchLogs(); // Immediately refresh logs
      }
    } catch (error) {
      console.error('Failed to submit log:', error);
    }
  };

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
          <p className="text-gray-500 mt-1">管理 Netless / Agora Whiteboard SDK 連線參數及調試日誌</p>
        </div>
        <div className="text-sm text-gray-400">
           系統狀態: <span className="text-green-500 font-bold">● 已連線</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8">
        <div className="flex border-b border-gray-300">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-4 font-semibold text-sm transition-colors relative ${
              activeTab === 'settings'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              SDK 連接設置
            </span>
            {activeTab === 'settings' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-4 font-semibold text-sm transition-colors relative ${
              activeTab === 'logs'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              SDK 調試日誌
              {agoraLogs.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-bold">
                  {agoraLogs.length}
                </span>
              )}
            </span>
            {activeTab === 'logs' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content - Settings */}
      {activeTab === 'settings' && (
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
      )}

      {/* Tab Content - Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* 日誌提交 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-700">提交測試日誌</h2>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={logSubmitInput}
                  onChange={(e) => setLogSubmitInput(e.target.value)}
                  placeholder="輸入日誌訊息..."
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmitLog()}
                />
                <select
                  value={logSubmitRole}
                  onChange={(e) => setLogSubmitRole(e.target.value as 'teacher' | 'student')}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                >
                  <option value="teacher">👨‍🏫 教師</option>
                  <option value="student">👨‍🎓 學生</option>
                </select>
                <button
                  onClick={handleSubmitLog}
                  disabled={!logSubmitInput.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  提交
                </button>
              </div>
              <p className="text-xs text-gray-500">日誌將每 5 秒自動刷新，用於監控教師和學生的連線狀態</p>
            </div>
          </div>

          {/* 日誌顯示 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-bold text-gray-700">Agora SDK 調試日誌記錄 ({agoraLogs.length})</h2>
              <span className="text-xs text-gray-500">
                {isLoadingLogs ? '更新中...' : '最新'}
              </span>
            </div>
            <div className="divide-y divide-gray-200">
              {agoraLogs.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <p>暫無日誌記錄</p>
                </div>
              ) : (
                agoraLogs.map((log) => (
                  <div key={log.id} className="p-6 hover:bg-gray-50 transition">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                        log.level === 'DEBUG' ? 'bg-gray-500' :
                        log.level === 'INFO' ? 'bg-blue-500' :
                        log.level === 'WARN' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}>
                        {log.level}
                      </span>
                      {log.role && (
                        <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                          log.role === 'teacher' ? 'bg-purple-500' : 'bg-green-500'
                        }`}>
                          {log.role === 'teacher' ? '👨‍🏫 Teacher' : '👨‍🎓 Student'}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-gray-800 mb-3 font-mono">
                      {log.message}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div className="p-3 bg-blue-50 rounded border border-blue-200">
                        <p className="text-xs font-semibold text-blue-700 mb-2">頻道 & 工作階段</p>
                        <div className="space-y-1">
                          {log.whiteboardUuid && (
                            <p className="text-xs text-blue-600 font-mono break-all">📺 UUID: {log.whiteboardUuid}</p>
                          )}
                          {log.session && (
                            <p className="text-xs text-blue-600 font-mono break-all">🔑 Session: {log.session}</p>
                          )}
                        </div>
                      </div>
                      {log.email && (
                        <div className="p-3 bg-purple-50 rounded border border-purple-200">
                          <p className="text-xs font-semibold text-purple-700 mb-1">📧 登入帳戶</p>
                          <p className="text-xs text-purple-600 font-mono break-all">{log.email}</p>
                        </div>
                      )}
                    </div>
                    {log.ua && (
                      <button
                        onClick={() => setSelectedUALog(log)}
                        className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition text-left"
                      >
                        <p className="text-xs font-semibold text-gray-600 mb-1">🖥️ Browser UA (點擊查看詳情)</p>
                        <p className="text-xs text-gray-700 font-mono line-clamp-2 truncate">{log.ua}</p>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Browser UA Modal */}
      {selectedUALog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Browser 詳細信息</h3>
              <button
                onClick={() => setSelectedUALog(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">👤 身份: {selectedUALog.role === 'teacher' ? '👨‍🏫 教師' : '👨‍🎓 學生'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">🕐 時間: {new Date(selectedUALog.timestamp).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">📧 Email: {selectedUALog.email || '無'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">📺 Whiteboard UUID: {selectedUALog.whiteboardUuid || '無'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">🔑 Session: {selectedUALog.session || '無'}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-700 mb-3">🖥️ Browser User-Agent String:</p>
                <div className="p-4 bg-gray-50 rounded border border-gray-300 font-mono text-xs text-gray-700 leading-relaxed break-all">
                  {selectedUALog.ua}
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedUALog.ua || '');
                    alert('已複製到剪貼簿');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-bold transition"
                >
                  複製 UA
                </button>
                <button
                  onClick={() => setSelectedUALog(null)}
                  className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 text-sm rounded-lg font-bold transition"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
