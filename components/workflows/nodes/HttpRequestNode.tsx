import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function HttpRequestNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-sky-500 rounded-lg shadow-lg w-56 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-sky-500 border-2 border-white"
            />
            <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-3 py-2 flex items-center justify-between font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span>🌐</span> HTTP
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
                className="w-3 h-3 bg-sky-500 border-2 border-white"
            />
        </div>
    );
}
