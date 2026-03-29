import React from 'react';
import { useReactFlow } from '@xyflow/react';

interface NodeActionsProps {
    onSave?: () => void;
    onDelete?: (id: string) => void;
    id: string;
    status?: string | null;
}

export function NodeActions({ onSave, onDelete, id, status }: NodeActionsProps) {
    const { setNodes, setEdges } = useReactFlow();

    const handleDeleteNode = () => {
        if (onDelete) {
            onDelete(id);
        } else {
            setNodes((nds) => nds.filter((node) => node.id !== id));
            setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
        }
    };

    return (
        <div className="flex items-center gap-1.5 ml-auto">
            {/* Save Button */}
            {onSave && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onSave();
                    }}
                    className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/40 border border-white/30 rounded-md transition-all active:scale-90"
                    title="Save Workflow"
                >
                    <span className="text-xs">💾</span>
                </button>
            )}
            
            {/* Delete Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Remove this node?')) {
                        handleDeleteNode();
                    }
                }}
                className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/40 border border-white/30 rounded-md transition-all active:scale-90"
                title="Remove Node"
            >
                <span className="text-xs">🗑️</span>
            </button>

            {/* Status Badge (if exists) */}
            {status && (
                <div className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-extrabold tracking-wider shadow-sm border border-white/20 ${
                    status === 'success' || status === 'TRUE' ? 'bg-green-500 text-white' : 
                    status === 'error' || status === 'FALSE' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white animate-pulse'
                }`}>
                    {status}
                </div>
            )}
        </div>
    );
}
