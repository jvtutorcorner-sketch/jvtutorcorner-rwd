import { Handle, Position } from '@xyflow/react';

export function ActionNode({ data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-blue-500 rounded-lg shadow-xl w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-blue-500 border-2 border-white hover:scale-125 transition-transform"
            />
            <div className={`bg-blue-500 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold`}>
                <div className="flex items-center gap-2">
                    <span>⚙️</span> Action
                </div>
                {data.status && (
                    <div className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${
                        data.status === 'success' ? 'bg-green-400' : 
                        data.status === 'error' ? 'bg-red-400' : 'bg-blue-400 animate-pulse'
                    }`}>
                        {data.status}
                    </div>
                )}
            </div>
            <div className="p-4 bg-white">
                <div className="text-sm font-bold text-gray-800 mb-1">{data.label}</div>
                <div className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{data.description || 'Executes a task'}</div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-blue-500 border-2 border-white hover:scale-150 transition-transform"
            />
        </div>
    );
}
