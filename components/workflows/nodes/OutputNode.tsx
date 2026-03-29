import { Handle, Position } from '@xyflow/react';

export function OutputNode({ data, isConnectable }: any) {
    const hasFiles = data.config?.files && data.config.files.length > 0;
    const hasDataExport = data.config?.exportOptions && Object.keys(data.config.exportOptions).length > 0;

    return (
        <div className="bg-white border-2 border-emerald-500 rounded-lg shadow-lg w-64 overflow-hidden">
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className="w-4 h-4 bg-emerald-500 border-2 border-white hover:scale-125 transition-transform cursor-crosshair shadow-sm"
            />
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-3 py-2 flex items-center gap-2 font-bold shadow-sm">
                <span>📤</span> Workflow Output
            </div>
            <div className="p-3">
                <div className="text-sm font-semibold mb-1">{data.label || 'End Output'}</div>
                <div className="text-xs text-gray-500 mb-3">{data.description || 'Final data and files output'}</div>
                
                <div className="space-y-1.5 font-sans">
                    {hasDataExport && (
                        <div className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1 font-semibold uppercase flex items-center gap-1.5 w-fit">
                            <span>📦</span> Export Data Ready
                        </div>
                    )}
                    
                    {hasFiles && (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-100 rounded px-2 py-1 w-fit">
                            <span>📁</span> {data.config.files.length} File Output(s)
                        </div>
                    )}

                    {!hasDataExport && !hasFiles && (
                        <div className="text-[10px] italic text-gray-400 border border-dashed border-gray-200 rounded p-1.5 text-center">
                            Waiting for output...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
