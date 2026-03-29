import { Handle, Position } from '@xyflow/react';

export function AiNode({ data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-purple-500 rounded-lg shadow-lg w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-purple-500"
            />
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-3 py-2 flex items-center gap-2 font-bold shadow-sm">
                <span>✨</span> AI Processor
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="text-xs text-gray-500">{data.description || 'AI analysis & generation'}</div>
                <div className="mt-2 text-[10px] bg-purple-50 text-purple-600 border border-purple-100 rounded px-1 w-fit font-bold uppercase tracking-wider">
                    Powered by Platform AI
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-purple-500"
            />
        </div>
    );
}
