'use client';

import React, { useState, useEffect } from 'react';
import VideoControls from '@/components/VideoControls';

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
  const [currentQuality, setCurrentQuality] = useState<'low' | 'medium' | 'high' | 'ultra'>('high');
  const [isLowLatencyMode, setIsLowLatencyMode] = useState(false);
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

  // Fetch logs on component mount and every 30 seconds
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);


  const handleSaveVideoSettings = async () => {
    setIsSaving(true);
    try {
      // TODO: 實際儲存到後端 API
      await new Promise(r => setTimeout(r, 1000));
      setLastSaved(new Date().toLocaleTimeString());
      alert('視訊品質設定已儲存！');
    } catch (error) {
      console.error('Failed to save video settings:', error);
      alert('儲存失敗，請重試');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Agora 音訊/視訊通話API</h1>
          <p className="text-gray-500 mt-1">管理 Agora Netless Whiteboard 參數設定及調試日誌</p>
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
            className={`px-6 py-4 font-semibold text-sm transition-colors relative ${activeTab === 'settings'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              視訊品質設定
            </span>
            {activeTab === 'settings' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-4 font-semibold text-sm transition-colors relative ${activeTab === 'logs'
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
          {/* Video Quality Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-700">視訊品質設定</h2>
            </div>
            <div className="p-6">
              <VideoControls
                currentQuality={currentQuality}
                isLowLatencyMode={isLowLatencyMode}
                onQualityChange={setCurrentQuality}
                onLowLatencyToggle={setIsLowLatencyMode}
                hasVideo={true}
              />
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {lastSaved && `最後儲存時間: ${lastSaved}`}
              </span>
              <button
                onClick={handleSaveVideoSettings}
                disabled={isSaving}
                className={`px-6 py-2 rounded-lg font-bold text-white transition shadow-sm ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  }`}
              >
                {isSaving ? '儲存中...' : '儲存設定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content - Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* 日誌顯示 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-bold text-gray-700">Agora 音訊/視訊API調適紀錄 ({agoraLogs.length})</h2>
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
                      <span className={`px-2 py-1 rounded text-xs font-bold text-white ${log.level === 'DEBUG' ? 'bg-gray-500' :
                        log.level === 'INFO' ? 'bg-blue-500' :
                          log.level === 'WARN' ? 'bg-yellow-500' :
                            'bg-red-500'
                        }`}>
                        {log.level}
                      </span>
                      {log.role && (
                        <span className={`px-2 py-1 rounded text-xs font-bold text-white ${log.role === 'teacher' ? 'bg-purple-500' : 'bg-green-500'
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
                        <p className="text-xs font-semibold text-gray-400 mb-1">🖥️ Browser UA (點擊查看詳情)</p>
                        <p className="text-xs text-gray-400 font-mono line-clamp-2 truncate">{log.ua}</p>
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
                <p className="text-xs font-semibold text-gray-400 mb-3">🖥️ Browser User-Agent String:</p>
                <div className="p-4 bg-gray-50 rounded border border-gray-300 font-mono text-xs text-gray-400 leading-relaxed break-all">
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
