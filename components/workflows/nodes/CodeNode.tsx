import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function CodeNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-[#1e1e1e] border-2 border-yellow-500 rounded-lg shadow-lg w-56 overflow-hidden flex flex-col text-white">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-yellow-500 border-2 border-white"
            />
            <div className="bg-gradient-to-r from-yellow-500 to-amber-600 text-black px-3 py-2 flex items-center justify-between font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>🐍</span> Python
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            <div className="px-3 py-2 bg-gray-900/50">
                <div className="text-xs font-bold text-gray-200">{data.label}</div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-yellow-500 border-2 border-white"
            />
        </div>
    );
}
