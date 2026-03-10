import { Handle, Position } from '@xyflow/react';

export function ActionNode({ data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-blue-500 rounded-md shadow-md w-64">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-blue-500"
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
                className="w-3 h-3 bg-blue-500"
            />
        </div>
    );
}
