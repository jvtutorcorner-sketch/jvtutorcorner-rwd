import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function AiNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-purple-500 rounded-lg shadow-lg w-56 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-purple-500"
            />
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>{data.actionType === 'action_ai_supervisor' ? '👑' : data.actionType === 'action_ai_reflect' ? '🧐' : '✨'}</span> 
                    {data.actionType === 'action_ai_supervisor' ? 'Supervisor' : data.actionType === 'action_ai_reflect' ? 'Reflect' : 'AI'}
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            <div className="px-3 py-2 bg-white">
                <div className="text-xs font-bold text-gray-700">{data.label}</div>
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
