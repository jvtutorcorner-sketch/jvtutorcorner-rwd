import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function OutputNode({ id, data, isConnectable }: any) {
    const status = data.status || 'idle';

    return (
        <div className={`bg-white border-2 rounded-lg shadow-lg w-56 overflow-hidden ${
            status === 'success' ? 'border-emerald-500' : 
            status === 'error' ? 'border-rose-500' : 'border-slate-300'
        }`}>
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className={`w-3 h-3 border-2 border-white ${
                    status === 'success' ? 'bg-emerald-500' : 
                    status === 'error' ? 'bg-rose-500' : 'bg-slate-400'
                }`}
            />
            
            <div className={`px-3 py-2 flex items-center justify-between font-bold shadow-sm text-white ${
                status === 'success' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 
                status === 'error' ? 'bg-gradient-to-r from-rose-500 to-pink-600' : 
                'bg-gradient-to-r from-slate-500 to-slate-600'
            }`}>
                <div className="flex items-center gap-2">
                    <span>📤</span> 
                    <span>Output</span>
                </div>
                <NodeActions 
                    id={id} 
                    status={status !== 'idle' ? status : null} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>

            <div className="px-3 py-2">
                <div className="text-xs font-bold text-slate-800">{data.label || 'Output'}</div>
            </div>
        </div>
    );
}
