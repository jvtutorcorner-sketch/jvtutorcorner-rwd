import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function TriggerNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-emerald-500 rounded-lg shadow-xl w-64 overflow-hidden">
            <div className="bg-emerald-500 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold">
                <div className="flex items-center gap-2">
                    <span>⚡</span> Trigger
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            <div className="p-4 bg-white">
                <div className="text-sm font-bold text-gray-800 mb-1">{data.label}</div>
                <div className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{data.description || 'Starts the workflow'}</div>
            </div>
            <div className="px-4 pb-3 flex flex-wrap gap-1">
                 {data.triggerType && (
                     <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[9px] font-bold">
                         {data.triggerType.replace('trigger_', '').toUpperCase()}
                     </span>
                 )}
                 {data.config?.testPayload && (
                     <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[9px] font-bold flex items-center gap-1">
                         <span>🎯</span> JSON TEST
                     </span>
                 )}
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-emerald-500 border-2 border-white hover:scale-150 transition-transform cursor-crosshair"
            />
        </div>
    );
}
