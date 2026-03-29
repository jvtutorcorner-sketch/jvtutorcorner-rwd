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
                <div className="flex gap-2 mt-2 flex-wrap">
                    {Object.keys(TRANSFORM_ICONS).map((t) => (
                        <span
                            key={t}
                            className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold border ${
                                transformType === t
                                    ? 'bg-rose-100 text-rose-700 border-rose-300'
                                    : 'bg-gray-50 text-gray-400 border-gray-200'
                            }`}
                        >
                            {t}
                        </span>
                    ))}
                </div>
                <div className="mt-2 text-[10px] text-gray-500 italic">
                    {data.config?.expression || 'Configure transform in settings →'}
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
