import { Handle, Position } from '@xyflow/react';

export function LogicNode({ data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-orange-500 rounded-md shadow-md w-64">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-orange-500"
            />
            <div className="bg-orange-500 text-white px-3 py-2 rounded-t flex items-center gap-2 font-bold">
                <span>🔀</span> Logic / Condition
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label}</div>
                <div className="text-xs text-gray-500 italic">Splits flow based on data</div>
            </div>
            
            <div className="flex justify-between px-3 pb-3">
                <div className="relative">
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="true"
                        isConnectable={isConnectable}
                        className="w-3 h-3 bg-green-500"
                        style={{ left: '25%' }}
                    />
                    <span className="text-[10px] font-bold text-green-600 block mt-1 ml--2">TRUE</span>
                </div>
                <div className="relative">
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="false"
                        isConnectable={isConnectable}
                        className="w-3 h-3 bg-red-500"
                        style={{ left: '75%' }}
                    />
                    <span className="text-[10px] font-bold text-red-600 block mt-1 mr--2 uppercase">FALSE</span>
                </div>
            </div>
        </div>
    );
}
