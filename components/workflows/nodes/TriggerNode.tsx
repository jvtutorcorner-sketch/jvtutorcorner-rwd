import { Handle, Position } from '@xyflow/react';

export function TriggerNode({ data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-green-500 rounded-md shadow-md w-64">
            <div className="bg-green-500 text-white px-3 py-2 rounded-t flex items-center gap-2 font-bold">
                <span>⚡</span> Trigger
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="text-xs text-gray-500">{data.description || 'Starts the workflow'}</div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-green-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
        </div>
    );
}
