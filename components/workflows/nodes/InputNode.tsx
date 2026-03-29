import { Handle, Position } from '@xyflow/react';

export function InputNode({ data, isConnectable }: any) {
    const hasVariables = data.config?.variables && data.config.variables.length > 0;
    const hasFiles = data.config?.files && data.config.files.length > 0;

    return (
        <div className="bg-white border-2 border-indigo-500 rounded-lg shadow-lg w-64 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white px-3 py-2 flex items-center gap-2 font-bold shadow-sm">
                <span>📥</span> Workflow Input
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label || 'Start Input'}</div>
                <div className="text-xs text-gray-500 mb-3">{data.description || 'Define entry variables or files'}</div>
                
                <div className="space-y-1.5">
                    {hasVariables && (
                        <div className="flex gap-1 flex-wrap">
                            {data.config.variables.slice(0, 3).map((v: any, i: number) => (
                                <span key={i} className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded px-1.5 py-0.5 font-mono">
                                    {v.key}
                                </span>
                            ))}
                            {data.config.variables.length > 3 && <span className="text-[9px] text-gray-400">+{data.config.variables.length - 3} more</span>}
                        </div>
                    )}
                    
                    {hasFiles && (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-100 rounded px-2 py-1 w-fit">
                            <span>📎</span> {data.config.files.length} File(s) Attached
                        </div>
                    )}

                    {!hasVariables && !hasFiles && (
                        <div className="text-[10px] italic text-gray-400 border border-dashed border-gray-200 rounded p-1.5 text-center">
                            No inputs defined
                        </div>
                    )}
                </div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair shadow-sm"
            />
        </div>
    );
}
