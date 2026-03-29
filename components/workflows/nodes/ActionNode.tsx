import { Handle, Position } from '@xyflow/react';

export function ActionNode({ data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-blue-500 rounded-md shadow-md w-64">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-blue-500 border-2 border-white hover:scale-125 transition-transform"
            />
            <div className="bg-blue-500 text-white px-3 py-2 rounded-t flex items-center gap-2 font-bold">
                <span>⚙️</span> Action
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="text-xs text-gray-500">{data.description || 'Executes a task'}</div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-4 h-4 bg-blue-500 border-2 border-white hover:scale-150 transition-transform"
            />
        </div>
    );
}
