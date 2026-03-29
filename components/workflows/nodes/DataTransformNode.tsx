'use client';
import { Handle, Position } from '@xyflow/react';

const TRANSFORM_ICONS: Record<string, string> = {
    map: '🗺️',
    filter: '🔽',
    merge: '🔗',
    split: '✂️',
    sort: '🔢',
};

export function DataTransformNode({ data, isConnectable }: any) {
    const transformType = data.config?.transformType || 'map';

    return (
        <div className="bg-white border-2 border-rose-500 rounded-lg shadow-md w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-rose-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
            <div className="bg-gradient-to-r from-rose-500 to-pink-600 text-white px-3 py-2 flex items-center gap-2 font-bold shadow-sm">
                <span>{TRANSFORM_ICONS[transformType] || '⚙️'}</span> Data Transform
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-400">Path:</span>
                        <code className="text-rose-600 bg-rose-50 px-1 rounded truncate max-w-[120px]">
                            {data.config?.path || '.'}
                        </code>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-400">Target:</span>
                        <code className="text-rose-600 bg-rose-50 px-1 rounded truncate max-w-[120px]">
                            {data.config?.targetKey || 'transformed_data'}
                        </code>
                    </div>
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-5 h-5 bg-rose-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair"
            />
        </div>
    );
}
