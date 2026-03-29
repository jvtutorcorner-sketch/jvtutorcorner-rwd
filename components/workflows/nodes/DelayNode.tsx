'use client';
import { Handle, Position } from '@xyflow/react';

export function DelayNode({ data, isConnectable }: any) {
    const amount = data.config?.amount || 1;
    const unit = data.config?.unit || 'minutes';

    return (
        <div className="bg-white border-2 border-slate-400 rounded-lg shadow-md w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-slate-400 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
            <div className="bg-gradient-to-r from-slate-500 to-gray-600 text-white px-3 py-2 flex items-center gap-2 font-bold shadow-sm">
                <span>⏱️</span> Wait / Delay
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="flex items-center gap-2 mt-2">
                    <div className="bg-slate-100 border border-slate-200 rounded px-3 py-1.5 text-center">
                        <div className="text-xl font-bold text-slate-700">{amount}</div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">{unit}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                        Pauses execution before the next step
                    </div>
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-slate-400 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
        </div>
    );
}
