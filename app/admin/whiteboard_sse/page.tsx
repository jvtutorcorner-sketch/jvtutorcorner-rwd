'use client';

import React, { useState, useEffect } from 'react';

type WhiteboardPermission = {
  roleId: string;
  roleName: string;
  pen: boolean;
  erase: boolean;
  clear: boolean;
  pdf: boolean;
};

export default function WhiteboardSSEAdminPage() {
  const [activeTab, setActiveTab] = useState<'channel' | 'control' | 'permissions'>('channel');
  const [channelName, setChannelName] = useState('default');
  const [whiteboardUuid, setWhiteboardUuid] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<WhiteboardPermission[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialPermissions, setInitialPermissions] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  // Monitor for changes
  useEffect(() => {
    if (initialPermissions && permissions.length > 0) {
      const currentState = JSON.stringify(permissions);
      setHasChanges(currentState !== initialPermissions);
    }
  }, [permissions, initialPermissions]);

  async function loadData() {
    setLoading(true);
    try {
      let perms: WhiteboardPermission[] = [];

      // Load permissions from DynamoDB
      const permRes = await fetch('/api/admin/whiteboard-permissions');
      const permData = await permRes.json();
      if (permRes.ok && permData.ok) {
        perms = permData.permissions || [];
        setPermissions(perms);
        setInitialPermissions(JSON.stringify(perms));
      }

      // Load roles
      const roleRes = await fetch('/api/admin/roles');
      const roleData = await roleRes.json();
      if (roleRes.ok && roleData.ok) {
        setRoles(roleData.roles || []);
        
        // Initialize missing permissions
        const loadedRoles = roleData.roles || [];
        const missingPerms = loadedRoles.filter((role: any) => 
          !perms.some((p: WhiteboardPermission) => p.roleId === role.id)
        ).map((role: any) => ({
          roleId: role.id,
          roleName: role.name,
          pen: true,
          erase: role.id !== 'student',
          clear: role.id === 'admin' || role.id === 'teacher',
          pdf: role.id === 'admin'
        }));

        if (missingPerms.length > 0) {
          const updated = [...perms, ...missingPerms];
          setPermissions(updated);
          setInitialPermissions(JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }

  // 模擬發送控制指令到伺服器
  const sendCommand = async (type: string, data: any = {}) => {
    try {
      const response = await fetch('/api/whiteboard/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid: channelName,
          event: { type, ...data, timestamp: Date.now() }
        })
      });
      if (response.ok) {
        return true;
      }
    } catch (e) {
      console.error('Failed to send command:', e);
    }
    return false;
  };

  const handleClearAll = async () => {
    if (!confirm('確定要清除所有客戶端的白板內容嗎？')) return;
    setIsCleaning(true);
    await sendCommand('clear_all');
    setTimeout(() => setIsCleaning(false), 1000);
    alert('已發送全域清除指令');
  };

  const handlePdfBroadcast = () => {
    setPdfStatus('正在快照並廣播 PDF...');
    setTimeout(() => {
      setPdfStatus('PDF 廣播完成 (第一頁)');
      setTimeout(() => setPdfStatus(null), 3000);
    }, 1500);
  };

  async function savePermissions() {
    console.log('🔘 [Whiteboard SSE] 點擊「儲存權限設定」按鈕');
    console.log('📋 [Whiteboard SSE] 目前 permissions:', permissions);
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/whiteboard-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setInitialPermissions(JSON.stringify(permissions));
        setHasChanges(false);
        setSaveMessage('✅ 儲存成功');
        console.log('✅ [Whiteboard SSE] 儲存成功');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage('❌ 儲存失敗：' + (data?.error || res.statusText));
        console.error('❌ [Whiteboard SSE] 儲存失敗:', data?.error || res.statusText);
      }
    } catch (err: any) {
      setSaveMessage('❌ 網路錯誤：' + (err?.message || String(err)));
      console.error('❌ [Whiteboard SSE] 網路錯誤:', err);
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(roleId: string, field: keyof Omit<WhiteboardPermission, 'roleId' | 'roleName'>) {
    setPermissions(prev => prev.map(p =>
      p.roleId === roleId ? { ...p, [field]: !p[field] } : p
    ));
  }

  if (loading) {
    return <div className="container mx-auto px-6 py-8 max-w-5xl">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-5xl">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">白板管理 (SSE)</h1>
          <p className="text-gray-500 mt-1">遠端控制客戶端白板行為、PDF 投放與權限設定</p>
        </div>
        <span className="text-green-500 font-bold animate-pulse text-xs">SSE ACTIVE</span>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8">
        <div className="flex border-b border-gray-300">
          <button
            onClick={() => setActiveTab('channel')}
            className={`px-6 py-4 font-semibold text-sm transition-colors relative ${
              activeTab === 'channel'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4.243 4.243a4 4 0 105.656 5.656l4.243-4.243" />
              </svg>
              頻道連線
            </span>
            {activeTab === 'channel' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('control')}
            className={`px-6 py-4 font-semibold text-sm transition-colors relative ${
              activeTab === 'control'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              遠端控制 & PDF 投放
            </span>
            {activeTab === 'control' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`px-6 py-4 font-semibold text-sm transition-colors relative ${
              activeTab === 'permissions'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              權限控制
            </span>
            {activeTab === 'permissions' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'channel' && (
        <div className="max-w-2xl">
          {/* 頻道連線 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4.243 4.243a4 4 0 105.656 5.656l4.243-4.243" />
              </svg>
              頻道連線設定
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">頻道名稱</label>
                <select
                  className="w-full border rounded-lg px-4 py-3 font-mono text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                >
                  <option value="production-main">production-main</option>
                  <option value="production-classroom">production-classroom</option>
                  <option value="staging-test">staging-test</option>
                  <option value="development">development</option>
                </select>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-800">連線狀態</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      當前頻道: <span className="font-mono font-bold text-blue-600">{channelName}</span>
                    </p>
                  </div>
                  {channelName ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      連線中
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      未連線
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h3 className="font-medium text-blue-800 mb-2">使用說明</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• 選擇適當的頻道名稱來連接到對應的白板環境</li>
                  <li>• 所有遠端控制指令都會廣播到此頻道的訂閱者</li>
                  <li>• 確保選擇正確的環境以避免干擾生產系統</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'control' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 指令控制台 */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                遠端控制指令
              </h2>
              
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 italic text-sm text-gray-600">
                  提示：指令將透過 SSE 實時廣播至所有訂閱了「{channelName}」頻道的瀏覽器。
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">白板 UUID</label>
                  <input
                    type="text"
                    value={whiteboardUuid}
                    onChange={(e) => setWhiteboardUuid(e.target.value)}
                    placeholder="輸入白板 UUID (例如: whiteboard-001)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button 
                  onClick={handleClearAll}
                  disabled={isCleaning || !whiteboardUuid}
                  className="w-full py-4 text-white rounded-xl font-bold transition flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: !whiteboardUuid ? '#d1d5db' : '#ef4444',
                    cursor: !whiteboardUuid ? 'not-allowed' : 'pointer'
                  }}
                  title={!whiteboardUuid ? '請先填入 whiteboardUuid' : ''}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  {isCleaning ? '清理中...' : '全域清除畫布 (Clear All)'}
                </button>
              </div>
            </section>

            {/* PDF 投放管理 */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                PDF 投放
              </h2>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 transition cursor-pointer">
                  <div className="text-gray-400 mb-2">
                    <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">點擊或拖放 PDF 檔案</p>
                  <p className="text-xs text-gray-400 mt-1">選取後將轉換為底圖並同步至所有白板</p>
                </div>

                <button 
                  onClick={handlePdfBroadcast}
                  disabled={!whiteboardUuid}
                  className="w-full py-3 text-white rounded-lg font-bold transition shadow-md"
                  style={{
                    backgroundColor: !whiteboardUuid ? '#9ca3af' : '#2563eb',
                    cursor: !whiteboardUuid ? 'not-allowed' : 'pointer'
                  }}
                  title={!whiteboardUuid ? '請先填入 whiteboardUuid' : ''}
                >
                  廣播當前 PDF
                </button>

                {pdfStatus && (
                  <div className="text-center py-2 bg-green-50 text-green-700 text-xs rounded border border-green-100 font-medium animate-fade-in">
                    {pdfStatus}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'permissions' && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold">白板工具權限控制 (Permission)</h2>
            <div className="flex items-center gap-3">
              {saveMessage && (
                <div style={{
                  color: saveMessage.includes('成功') ? '#0b6' : '#c62828',
                  fontWeight: 600,
                  fontSize: '12px'
                }}>
                  {saveMessage}
                </div>
              )}
              <button 
                onClick={savePermissions} 
                disabled={saving || !hasChanges} 
                style={{ 
                  padding: '8px 16px',
                  background: !hasChanges ? '#cbd5e1' : '#2563eb',
                  color: 'white',
                  borderRadius: 6,
                  border: 'none',
                  cursor: !hasChanges ? 'not-allowed' : 'pointer',
                  opacity: !hasChanges ? 0.6 : 1,
                  fontWeight: 600,
                  fontSize: '12px'
                }}
                title={!hasChanges ? '沒有任何更改' : '儲存所有變更'}
              >
                {saving ? '儲存中…' : '儲存權限'}
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-left">
                  <th className="pb-3 font-medium">角色 (Role)</th>
                  <th className="pb-3 font-medium text-center">畫筆 (Pen)</th>
                  <th className="pb-3 font-medium text-center">橡皮擦 (Erase)</th>
                  <th className="pb-3 font-medium text-center">清除鍵 (Clear)</th>
                  <th className="pb-3 font-medium text-center">PDF 預覽 (PDF)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {permissions.map((perm) => (
                  <tr key={perm.roleId}>
                    <td className="py-4 font-bold">{perm.roleName}</td>
                    <td className="py-4 text-center">
                      <input
                        type="checkbox"
                        checked={perm.pen}
                        onChange={() => togglePermission(perm.roleId, 'pen')}
                        style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                      />
                    </td>
                    <td className="py-4 text-center">
                      <input
                        type="checkbox"
                        checked={perm.erase}
                        onChange={() => togglePermission(perm.roleId, 'erase')}
                        style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                      />
                    </td>
                    <td className="py-4 text-center">
                      <input
                        type="checkbox"
                        checked={perm.clear}
                        onChange={() => togglePermission(perm.roleId, 'clear')}
                        style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                      />
                    </td>
                    <td className="py-4 text-center">
                      <input
                        type="checkbox"
                        checked={perm.pdf}
                        onChange={() => togglePermission(perm.roleId, 'pdf')}
                        style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
