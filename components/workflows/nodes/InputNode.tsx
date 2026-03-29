import { Handle, Position, useReactFlow } from '@xyflow/react';
import { NodeActions } from './NodeActions';

export function InputNode({ id, data, isConnectable }: any) {
    const { updateNodeData } = useReactFlow();
    const variables = data.config?.variables || [];
    const hasFiles = data.config?.files && data.config.files.length > 0;

    const updateVariable = (index: number, updates: any) => {
        const newVariables = [...variables];
        newVariables[index] = { ...newVariables[index], ...updates };
        updateNodeData(id, { config: { ...data.config, variables: newVariables } });
    };

    const addVariable = () => {
        const newVariables = [...variables, { key: 'new_var', value: '', type: 'string' }];
        updateNodeData(id, { config: { ...data.config, variables: newVariables } });
    };

    const removeVariable = (index: number) => {
        const newVariables = variables.filter((_: any, i: number) => i !== index);
        updateNodeData(id, { config: { ...data.config, variables: newVariables } });
    };

    return (
        <div className="bg-white border-2 border-indigo-500 rounded-xl shadow-xl w-72 overflow-hidden transition-all hover:shadow-2xl">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white px-4 py-2.5 flex items-center justify-between font-bold shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-lg">📥</span> 
                    <span className="tracking-tight">Input Node</span>
                </div>
                <NodeActions 
                    id={id} 
                    status={data.status} 
                    onSave={data.onSave} 
                    onDelete={data.onDelete} 
                />
            </div>
            
            <div className="p-4 space-y-4">
                <div className="space-y-1">
                    <input 
                        className="nodrag text-sm font-bold w-full bg-transparent border-b border-transparent hover:border-indigo-100 focus:border-indigo-500 focus:outline-none transition-colors"
                        value={data.label || 'Workflow Entry'}
                        onChange={(e) => updateNodeData(id, { label: e.target.value })}
                        placeholder="Node Label"
                    />
                    <textarea 
                        className="nodrag text-[10px] text-gray-400 w-full bg-transparent border-none focus:outline-none resize-none h-8 leading-tight"
                        value={data.description || 'Set the initial parameters for your workflow.'}
                        onChange={(e) => updateNodeData(id, { description: e.target.value })}
                        placeholder="Add a description..."
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">
                        <span>Variables</span>
                        <button 
                            onClick={addVariable}
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 p-1 rounded transition-all"
                            title="Add Variable"
                        >
                            <span className="text-sm">+</span>
                        </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {variables.length > 0 ? (
                            variables.map((v: any, i: number) => (
                                <div key={i} className="group flex flex-col gap-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg hover:border-indigo-200 hover:bg-white transition-all">
                                    <div className="flex items-center gap-2">
                                        <input
                                            className="nodrag flex-1 text-[10px] font-mono font-bold text-indigo-700 bg-transparent border-none focus:outline-none"
                                            value={v.key}
                                            onChange={(e) => updateVariable(i, { key: e.target.value })}
                                            placeholder="key"
                                        />
                                        <button 
                                            onClick={() => removeVariable(i)}
                                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-500 transition-opacity"
                                        >
                                            <span className="text-xs">✕</span>
                                        </button>
                                    </div>
                                    <input
                                        className="nodrag w-full text-[11px] p-2 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none transition-all shadow-sm"
                                        value={v.value || ''}
                                        onChange={(e) => updateVariable(i, { value: e.target.value })}
                                        placeholder="Enter value..."
                                    />
                                </div>
                            ))
                        ) : (
                            <div className="text-[10px] italic text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center">
                                No variables defined. <br/> Click + to start.
                            </div>
                        )}
                    </div>
                    
                    {hasFiles && (
                        <div className="flex items-center gap-2 text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                            <span className="text-base">📎</span> 
                            <span>{data.config.files.length} File(s) Ready</span>
                        </div>
                    )}
                </div>
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="w-4 h-4 bg-indigo-500 border-4 border-white hover:scale-125 transition-transform cursor-crosshair shadow-md active:bg-indigo-700"
            />
        </div>
    );
}
