import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function WebhookNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-emerald-500 rounded-lg shadow-lg w-56 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-cyan-600 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>🔗</span> Webhook
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
                className="w-3 h-3 bg-emerald-500 border-2 border-white"
            />
        </div>
    );
}
