import { Handle, Position } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function OutputNode({ id, data, isConnectable }: any) {
    const hasFiles = data.config?.files && data.config.files.length > 0;
    const hasDataExport = data.config?.exportOptions && Object.keys(data.config.exportOptions).length > 0;
    const lastOutput = data.lastOutput;
    const status = data.status || 'idle';

    return (
        <div className={`bg-white border-2 rounded-xl shadow-xl w-72 overflow-hidden transition-all hover:shadow-2xl ${
            status === 'success' ? 'border-emerald-500' : 
            status === 'error' ? 'border-rose-500' : 
            status === 'running' ? 'border-blue-500 animate-pulse' : 'border-slate-300'
        }`}>
            <Handle
                type="target"
                position={Position.Top}
                isConnectable={isConnectable}
                className={`w-4 h-4 border-4 border-white hover:scale-125 transition-transform cursor-crosshair shadow-md ${
                    status === 'success' ? 'bg-emerald-500' : 
                    status === 'error' ? 'bg-rose-500' : 'bg-slate-400'
                }`}
            />
            
            <div className={`px-4 py-2.5 flex items-center justify-between font-bold shadow-sm text-white ${
                status === 'success' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 
                status === 'error' ? 'bg-gradient-to-r from-rose-500 to-pink-600' : 
                'bg-gradient-to-r from-slate-500 to-slate-600'
            }`}>
                <div className="flex items-center gap-2">
                    <span className="text-lg">📤</span> 
                    <span className="tracking-tight">Output Node</span>
                </div>
                <NodeActions 
                    id={id} 
                    status={status !== 'idle' ? status : null} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>

            <div className="p-4 space-y-4">
                <div className="space-y-1">
                    <div className="text-sm font-bold text-slate-800">{data.label || 'Workflow Results'}</div>
                    <div className="text-[10px] text-slate-500 leading-tight">
                        {data.description || 'View the final processed data and generated files.'}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">
                        Results Preview
                    </div>

                    {lastOutput ? (
                        <div className="relative group">
                            <pre className="nodrag text-[10px] bg-slate-900 text-blue-300 p-3 rounded-lg max-h-48 overflow-auto font-mono custom-scrollbar border border-slate-800 shadow-inner">
                                {JSON.stringify(lastOutput, null, 2)}
                            </pre>
                            <button 
                                onClick={() => navigator.clipboard.writeText(JSON.stringify(lastOutput, null, 2))}
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-slate-800 text-slate-300 hover:text-white p-1 rounded border border-slate-700 transition-all text-[9px]"
                                title="Copy JSON"
                            >
                                Copy
                            </button>
                        </div>
                    ) : (
                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-6 text-center">
                            <div className="text-2xl mb-1 opacity-20">📥</div>
                            <div className="text-[10px] text-slate-400 italic">
                                Waiting for workflow execution...
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {hasDataExport && (
                            <div className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1 font-bold uppercase flex items-center gap-1.5 shadow-sm">
                                <span>📦</span> Data Export Ready
                            </div>
                        )}
                        
                        {hasFiles && (
                            <div className="flex items-center gap-1.5 text-[9px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1 shadow-sm">
                                <span>📁</span> {data.config.files.length} File Output(s)
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {status === 'success' && (
                <div className="px-4 py-2 bg-emerald-50 border-t border-emerald-100 flex justify-center">
                    <button className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-widest">
                        Download Full Report
                    </button>
                </div>
            )}
        </div>
    );
}
