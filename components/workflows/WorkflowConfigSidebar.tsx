'use client';

import React from 'react';

interface SidebarProps {
    selectedNode: any;
    setNodes: any;
}

export function WorkflowConfigSidebar({ selectedNode, setNodes }: SidebarProps) {
    if (!selectedNode) {
        return (
            <div className="w-80 border-l bg-gray-50 flexflex-col p-4 text-gray-500 flex items-center justify-center">
                Select a node to configure
            </div>
        );
    }

    const handleUpdate = (updates: any) => {
        setNodes((nds: any[]) =>
            nds.map((n) => {
                if (n.id === selectedNode.id) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            ...updates,
                        },
                    };
                }
                return n;
            })
        );
    };

    return (
        <div className="w-80 border-l bg-white flex flex-col h-full shadow-lg">
            <div className="p-4 border-b font-bold bg-gray-100 flex items-center gap-2">
                {selectedNode.type === 'trigger' ? '⚡ Trigger Settings' : '⚙️ Action Settings'}
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                    <input
                        type="text"
                        className="w-full border rounded-md p-2 text-sm"
                        value={selectedNode.data?.label || ''}
                        onChange={(e) => handleUpdate({ label: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        className="w-full border rounded-md p-2 text-sm"
                        rows={3}
                        value={selectedNode.data?.description || ''}
                        onChange={(e) => handleUpdate({ description: e.target.value })}
                    />
                </div>

                {selectedNode.data?.actionType === 'action_send_email' && (
                    <div className="space-y-4 border-t pt-4">
                        <h3 className="font-semibold text-sm">Email Settings</h3>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Subject Template</label>
                            <input
                                type="text"
                                className="w-full border rounded-md p-2 text-sm"
                                value={selectedNode.data?.config?.subject || ''}
                                onChange={(e) => handleUpdate({ config: { ...selectedNode.data.config, subject: e.target.value } })}
                                placeholder="e.g. Welcome to {{courseName}}!"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Body Template</label>
                            <textarea
                                className="w-full border rounded-md p-2 text-sm"
                                rows={5}
                                value={selectedNode.data?.config?.body || ''}
                                onChange={(e) => handleUpdate({ config: { ...selectedNode.data.config, body: e.target.value } })}
                                placeholder="Hello {{studentName}}, ..."
                            />
                        </div>
                    </div>
                )}

                {selectedNode.data?.actionType === 'action_grant_points' && (
                    <div className="space-y-4 border-t pt-4">
                        <h3 className="font-semibold text-sm">Points Settings</h3>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Points Amount</label>
                            <input
                                type="number"
                                className="w-full border rounded-md p-2 text-sm"
                                value={selectedNode.data?.config?.amount || 0}
                                onChange={(e) => handleUpdate({ config: { ...selectedNode.data.config, amount: Number(e.target.value) } })}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
