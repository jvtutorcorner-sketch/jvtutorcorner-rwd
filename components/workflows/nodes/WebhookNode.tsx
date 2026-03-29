import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function WebhookNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-emerald-500 rounded-lg shadow-lg w-64 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-cyan-600 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>🔗</span> Webhook Trigger
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="text-xs text-gray-500 mb-2">
                    {data.description || 'Listens for HTTP POST events'}
                </div>
                {data.config?.endpoint && (
                    <div className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-1 font-mono truncate">
                        POST /{data.config.endpoint}
                    </div>
                )}
                {!data.config?.endpoint && (
                    <div className="text-[10px] text-gray-400 italic">Configure endpoint in settings →</div>
                )}
                
                {data.config?.testPayload && (
                    <div className="mt-2 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[9px] font-bold inline-flex items-center gap-1">
                        <span>🎯</span> JSON TEST
                    </div>
                )}
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-emerald-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
        </div>
    );
}
