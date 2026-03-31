import { Handle, Position, useReactFlow } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function InputNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-indigo-500 rounded-lg shadow-lg w-56 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white px-3 py-2 flex items-center justify-between font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>📥</span> 
                    <span>Input</span>
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            
            <div className="px-3 py-2">
                <div className="text-xs font-bold text-gray-700">{data.label}</div>
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-indigo-500 border-2 border-white"
            />
        </div>
    );
}
