import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

export function CodeNode({ id, data, isConnectable }: any) {
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleTest = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRunning(true);
        setResult(null);
        try {
            const res = await fetch('/api/workflows/run-python', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    script: data.config?.script || '',
                    data: { test_value: 123, student_name: "Test Student" }
                })
            });
            const dataRes = await res.json();
            setResult(dataRes);
        } catch (err) {
            setResult({ ok: false, stderr: 'Failed to connect to runner' });
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="bg-[#1e1e1e] border-2 border-yellow-500 rounded-lg shadow-2xl w-72 overflow-hidden flex flex-col transition-all">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-yellow-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
            <div className="bg-gradient-to-r from-yellow-500 to-amber-600 text-black px-3 py-2 flex items-center justify-between font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>🐍</span> Python Script
                </div>
                <button
                    id={`run-btn-${id}`}
                    onClick={handleTest}
                    disabled={isRunning}
                    className={`text-[10px] px-2 py-0.5 rounded bg-black/20 hover:bg-black/40 border border-black/20 transition-all active:scale-95 flex items-center gap-1 ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isRunning ? 'Running...' : '▶ Test'}
                </button>
            </div>
            <div className="p-3 bg-gray-900/50">
                <div className="text-sm font-semibold text-gray-200 mb-1">{data.label}</div>
                <div className="text-[10px] text-gray-400 font-mono bg-black/60 p-2 rounded mb-2 h-20 overflow-auto border border-white/5 scrollbar-thin scrollbar-thumb-white/10">
                    {data.config?.script || '# Write your python code here'}
                </div>
                
                {result && (
                    <div className={`text-[10px] p-2 rounded mb-2 border ${result.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        <div className="font-bold uppercase tracking-wider mb-1 flex justify-between">
                            <span>{result.ok ? '✓ Success' : '✗ Error'}</span>
                            <button onClick={(e) => { e.stopPropagation(); setResult(null); }} className="opacity-50 hover:opacity-100">×</button>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono leading-tight max-h-24 overflow-auto scrollbar-thin scrollbar-thumb-white/10">
                            {result.stdout || result.stderr || result.error || (result.ok ? 'Empty output' : 'Unknown error')}
                        </pre>
                    </div>
                )}

                <div className="text-[9px] text-yellow-500 flex items-center gap-1 font-bold italic uppercase opacity-70">
                    <span className={isRunning ? "animate-pulse" : ""}>●</span> Script Processor
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-yellow-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
        </div>
    );
}
