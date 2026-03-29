import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function ExportNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-green-600 rounded-lg shadow-lg w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-green-600"
            />
            <div className="bg-gradient-to-r from-green-600 to-teal-700 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>📄</span> Export to CSV
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
                <div className="text-xs text-gray-500 mb-2">{data.description || 'Saves data into a CSV file'}</div>
                <div className="mt-2 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-2 py-1 flex items-center gap-1.5 font-bold uppercase w-fit">
                    <span>💾</span> File output ready
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-green-600"
            />
        </div>
    );
}
