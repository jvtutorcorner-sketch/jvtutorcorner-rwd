import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function LogicNode({ id, data, isConnectable }: any) {
    return (
        <div className="bg-white border-2 border-orange-500 rounded-lg shadow-xl w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-orange-500 border-2 border-white"
            />
            <div className="bg-orange-500 text-white px-3 py-2 flex items-center justify-between gap-2 font-bold">
                <div className="flex items-center gap-2">
                    <span>{data.actionType === 'logic_loop_items' ? '🔁' : data.actionType === 'logic_loop' ? '🔄' : '🔀'}</span> 
                    {data.actionType === 'logic_loop_items' ? 'Loop Over Items' : data.actionType === 'logic_loop' ? 'Loop Iterator' : 'Logic / Condition'}
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status === 'success' ? 'TRUE' : data.status === 'failed_condition' ? 'FALSE' : data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            <div className="p-4 bg-white">
                <div className="text-sm font-bold text-gray-800 mb-1">{data.label}</div>
                <div className="text-[11px] text-gray-500 italic">
                    {data.actionType === 'logic_loop_items' ? 'Iterates over a list' : data.actionType === 'logic_loop' ? 'Loops multiple times' : 'Splits flow based on criteria'}
                </div>
            </div>
            
            <div className="flex justify-between px-3 pb-8 relative">
                <div className="flex flex-col items-center">
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="true"
                        isConnectable={isConnectable}
                        className="w-4 h-4 bg-green-500 border-2 border-white hover:scale-150 transition-transform"
                        style={{ left: '25%' }}
                    />
                    <div className="text-[10px] font-extrabold text-green-600 mt-4">
                        {data.actionType?.includes('loop') ? 'NEXT' : 'TRUE'}
                    </div>
                </div>
                <div className="flex flex-col items-center">
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="false"
                        isConnectable={isConnectable}
                        className="w-4 h-4 bg-red-500 border-2 border-white hover:scale-150 transition-transform"
                        style={{ left: '75%' }}
                    />
                    <div className="text-[10px] font-extrabold text-red-600 mt-4">
                        {data.actionType?.includes('loop') ? 'DONE' : 'FALSE'}
                    </div>
                </div>
            </div>
        </div>
    );
}
