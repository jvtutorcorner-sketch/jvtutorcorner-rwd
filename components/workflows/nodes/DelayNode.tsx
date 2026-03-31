import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function DelayNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-slate-400 rounded-lg shadow-lg w-56 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-slate-400 border-2 border-white"
            />
            <div className="bg-gradient-to-r from-slate-500 to-gray-600 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>⏱️</span> Delay
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
                className="w-3 h-3 bg-slate-400 border-2 border-white"
            />
        </div>
    );
}
