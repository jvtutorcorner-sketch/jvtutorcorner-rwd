'use client';
import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

export function HttpRequestNode({ data, isConnectable }: any) {
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);

    const handleTest = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!data.config?.url) return;
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/workflows/http-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: data.config.url,
                    method: data.config.method || 'GET',
                    headers: data.config.headers || {},
                    body: data.config.body || null,
                }),
            });
            const json = await res.json();
            setTestResult(json);
        } catch {
            setTestResult({ ok: false, error: 'Failed to reach proxy' });
        } finally {
            setIsTesting(false);
        }
    };

    const methodColor: Record<string, string> = {
        GET: 'bg-blue-100 text-blue-700',
        POST: 'bg-green-100 text-green-700',
        PUT: 'bg-yellow-100 text-yellow-700',
        DELETE: 'bg-red-100 text-red-700',
        PATCH: 'bg-purple-100 text-purple-700',
    };

    const method = data.config?.method || 'GET';

    return (
        <div className="bg-white border-2 border-sky-500 rounded-lg shadow-lg w-72 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-sky-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
            <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-3 py-2 flex items-center justify-between font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>🌐</span> HTTP Request
                </div>
                <button
                    onClick={handleTest}
                    disabled={isTesting || !data.config?.url}
                    className={`text-[10px] px-2 py-0.5 rounded bg-black/20 hover:bg-black/40 border border-black/20 transition-all active:scale-95 flex items-center gap-1 ${(isTesting || !data.config?.url) ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                    {isTesting ? '...' : '▶ Test'}
                </button>
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-2">{data.label}</div>
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${methodColor[method] || 'bg-gray-100 text-gray-600'}`}>
                        {method}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono truncate flex-1">
                        {data.config?.url || 'Not configured'}
                    </span>
                </div>

                {testResult && (
                    <div className={`text-[10px] p-2 rounded border mt-1 ${testResult.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                        <div className="font-bold mb-1">{testResult.ok ? `✓ ${testResult.status}` : '✗ Error'}</div>
                        <pre className="whitespace-pre-wrap font-mono leading-tight max-h-20 overflow-auto">
                            {testResult.ok
                                ? JSON.stringify(testResult.data, null, 2).slice(0, 200)
                                : testResult.error || testResult.stderr}
                        </pre>
                        <button
                            onClick={(e) => { e.stopPropagation(); setTestResult(null); }}
                            className="mt-1 opacity-50 hover:opacity-100 text-right w-full"
                        >× close</button>
                    </div>
                )}
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-sky-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
        </div>
    );
}
