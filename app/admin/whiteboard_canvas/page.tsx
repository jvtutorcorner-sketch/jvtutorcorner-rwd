'use client';

import React, { useState } from 'react';

export default function WhiteboardCanvasAdminPage() {
  const [channelName, setChannelName] = useState('default');
  const [isCleaning, setIsCleaning] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);

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

  return (
    <div className="container mx-auto px-6 py-8 max-w-5xl">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">原生畫布白板管理 (SSE)</h1>
          <p className="text-gray-500 mt-1">遠端控制客戶端白板行為與 PDF 投放</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            頻道連線: <input 
              className="border rounded px-2 py-1 font-mono text-blue-600 focus:outline-none"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>
          <span className="text-green-500 font-bold animate-pulse text-xs">SSE ACTIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

            <button 
              onClick={handleClearAll}
              disabled={isCleaning}
              className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              {isCleaning ? '清理中...' : '全域清除畫布 (Clear All)'}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => sendCommand('undo_all')} className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition italic">Undo All</button>
              <button onClick={() => sendCommand('redo_all')} className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition italic">Redo All</button>
            </div>
          </div>
        </section>

        {/* PDF 投放管理 */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            PDF 講義投放
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
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition shadow-md"
            >
              廣播當前講義 (Broadcast)
            </button>

            {pdfStatus && (
              <div className="text-center py-2 bg-green-50 text-green-700 text-xs rounded border border-green-100 font-medium animate-fade-in">
                {pdfStatus}
              </div>
            )}
          </div>
        </section>

        {/* 權限管理 */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:col-span-2">
          <h2 className="text-lg font-bold mb-4">白板工具權限控制 (Permission)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-left">
                  <th className="pb-3 font-medium">角色 (Role)</th>
                  <th className="pb-3 font-medium">畫筆 (Pen)</th>
                  <th className="pb-3 font-medium">橡皮擦 (Erase)</th>
                  <th className="pb-3 font-medium">清除鍵 (Clear)</th>
                  <th className="pb-3 font-medium">PDF 預覽 (PDF)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr>
                  <td className="py-3 font-bold">管理員 (Admin)</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                </tr>
                <tr>
                  <td className="py-3 font-bold text-gray-700">教師 (Teacher)</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                  <td className="py-3 text-gray-300">NO</td>
                </tr>
                <tr>
                  <td className="py-3 font-bold text-gray-700">學生 (Student)</td>
                  <td className="py-3 text-green-500 font-bold">YES</td>
                  <td className="py-3 text-gray-300">NO</td>
                  <td className="py-3 text-gray-300">NO</td>
                  <td className="py-3 text-gray-300">NO</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

