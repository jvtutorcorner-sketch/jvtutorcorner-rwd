'use client';

import React, { useEffect, useState } from 'react';

type ClassroomSettings = {
  enableWhiteboard: boolean;
  enableMedia: boolean;
  enablePdfUpload: boolean;
  whiteboardRoles: string[];
  mediaRoles: string[];
  pdfRoles: string[];
  defaultWhiteboardSystem: 'canvas' | 'agora';
};

type Role = {
  id: string;
  name: string;
};

export default function WhiteboardSettingsPage() {
  const [settings, setSettings] = useState<ClassroomSettings | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [settingsRes, rolesRes] = await Promise.all([
          fetch('/api/admin/settings'),
          fetch('/api/admin/roles')
        ]);
        
        const settingsData = await settingsRes.json();
        const rolesData = await rolesRes.json();

        if (settingsRes.ok && rolesRes.ok) {
          const s = settingsData.settings || settingsData;
          setSettings(s.classroom || {
            enableWhiteboard: true,
            enableMedia: true,
            enablePdfUpload: true,
            whiteboardRoles: ['admin', 'teacher'],
            mediaRoles: ['admin', 'teacher', 'student'],
            pdfRoles: ['admin', 'teacher'],
            defaultWhiteboardSystem: 'canvas'
          });
          setRoles(rolesData.roles || []);
        }
      } catch (err) {
        console.error('Failed to load whiteboard settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    try {
      // 先取得完整設定，再覆蓋 classroom 部分
      const fullRes = await fetch('/api/admin/settings');
      const fullData = await fullRes.json();
      const currentFull = fullData.settings || fullData;

      const updatedFull = {
        ...currentFull,
        classroom: settings
      };

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFull)
      });

      if (res.ok) {
        setMessage(' whiteBoard 設定儲存成功！');
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage('儲存失敗');
      }
    } catch (err) {
      setMessage('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-500 italic">載入中...</div>;
  if (!settings) return <div className="p-8 text-red-500">無法載入設定資料</div>;

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">白板與課堂互動設定</h1>
          <p className="text-gray-500 mt-1">獨立管理全站教室的互動功能與權限卡控</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-2 rounded-lg font-bold text-white transition shadow-sm ${
            saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
          }`}
        >
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${message.includes('成功') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        {/* 段落：系統切換 */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h2 className="font-bold text-gray-700 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
              預設系統 (Default System)
            </h2>
          </div>
          <div className="p-6">
            <div className="max-w-md">
              <label className="block text-sm font-semibold text-gray-700 mb-2">請選擇預設啟用的白板技術</label>
              <select
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition"
                value={settings.defaultWhiteboardSystem}
                onChange={(e) => setSettings({ ...settings, defaultWhiteboardSystem: e.target.value as 'canvas' | 'agora' })}
              >
                <option value="canvas">原生畫布 (HTML5 Canvas + SSE 同步)</option>
                <option value="agora">Agora Netless (專業多人協作)</option>
              </select>
              <p className="mt-2 text-xs text-gray-400 italic">註：原生畫布適合簡單直播教學；Agora 適合高互動 1 對 1 私教。</p>
            </div>
          </div>
        </section>

        {/* 段落：功能開關與權限 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 白板卡控 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-700 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                白板繪圖卡控
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={settings.enableWhiteboard}
                  onChange={(e) => setSettings({ ...settings, enableWhiteboard: e.target.checked })}
                />
                <span className="font-semibold text-gray-800 group-hover:text-blue-600 transition">啟用白板工具欄</span>
              </label>

              <div className={`p-4 rounded-lg transition ${settings.enableWhiteboard ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 opacity-50 gray-scale'}`}>
                <span className="text-sm font-bold text-gray-700 block mb-3">允許使用工具的角色：</span>
                <div className="space-y-2">
                  {roles.map(role => (
                    <label key={role.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                      <input
                        type="checkbox"
                        disabled={!settings.enableWhiteboard}
                        checked={settings.whiteboardRoles.includes(role.id)}
                        onChange={(e) => {
                          const newRoles = e.target.checked
                            ? [...settings.whiteboardRoles, role.id]
                            : settings.whiteboardRoles.filter(id => id !== role.id);
                          setSettings({ ...settings, whiteboardRoles: newRoles });
                        }}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* PDF 講義卡控 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-700 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                PDF 講義與廣播卡控
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={settings.enablePdfUpload}
                  onChange={(e) => setSettings({ ...settings, enablePdfUpload: e.target.checked })}
                />
                <span className="font-semibold text-gray-800 group-hover:text-blue-600 transition">啟用 PDF 上傳與同步功能</span>
              </label>

              <div className={`p-4 rounded-lg transition ${settings.enablePdfUpload ? 'bg-red-50 border border-red-100' : 'bg-gray-50 opacity-50 gray-scale'}`}>
                <span className="text-sm font-bold text-gray-700 block mb-3">允許上傳並廣播講義的角色：</span>
                <div className="space-y-2">
                  {roles.map(role => (
                    <label key={role.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                      <input
                        type="checkbox"
                        disabled={!settings.enablePdfUpload}
                        checked={settings.pdfRoles?.includes(role.id) ?? false}
                        onChange={(e) => {
                          const currentPdfRoles = settings.pdfRoles || [];
                          const newRoles = e.target.checked
                            ? [...currentPdfRoles, role.id]
                            : currentPdfRoles.filter(id => id !== role.id);
                          setSettings({ ...settings, pdfRoles: newRoles });
                        }}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 媒體卡控 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-700 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                音訊視訊卡控
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={settings.enableMedia}
                  onChange={(e) => setSettings({ ...settings, enableMedia: e.target.checked })}
                />
                <span className="font-semibold text-gray-800 group-hover:text-blue-600 transition">啟用媒體交流系統</span>
              </label>

              <div className={`p-4 rounded-lg transition ${settings.enableMedia ? 'bg-orange-50 border border-orange-100' : 'bg-gray-50 opacity-50 gray-scale'}`}>
                <span className="text-sm font-bold text-gray-700 block mb-3">允許開啟鏡頭/麥克風的角色：</span>
                <div className="space-y-2">
                  {roles.map(role => (
                    <label key={role.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                      <input
                        type="checkbox"
                        disabled={!settings.enableMedia}
                        checked={settings.mediaRoles.includes(role.id)}
                        onChange={(e) => {
                          const newRoles = e.target.checked
                            ? [...settings.mediaRoles, role.id]
                            : settings.mediaRoles.filter(id => id !== role.id);
                          setSettings({ ...settings, mediaRoles: newRoles });
                        }}
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
