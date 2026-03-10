'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    Connection,
    Edge,
    Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { WorkflowConfigSidebar } from './WorkflowConfigSidebar';

const nodeTypes = {
    trigger: TriggerNode,
    action: ActionNode,
};

interface WorkflowCanvasProps {
    initialWorkflow?: any;
    onSave?: (workflow: any) => void;
}

function CanvasFlow({ initialWorkflow, onSave }: WorkflowCanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialWorkflow?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialWorkflow?.edges || []);
    const [title, setTitle] = useState(initialWorkflow?.name || 'New Workflow');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const onConnect = useCallback((connection: Connection) => {
        setEdges((eds) => addEdge(connection, eds));
    }, [setEdges]);

    const onNodeClick = useCallback((_: any, node: Node) => {
        setSelectedNodeId(node.id);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
    }, []);

    const handleSave = () => {
        if (onSave) {
            onSave({ ...initialWorkflow, name: title, nodes, edges });
        }
    };

    const addNode = (type: 'trigger' | 'action', subtype: string) => {
        const id = `${type}_${Date.now()}`;
        const newNode: Node = {
            id,
            type,
            position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
            data: {
                label: `New ${subtype}`,
                description: '',
                triggerType: type === 'trigger' ? subtype : undefined,
                actionType: type === 'action' ? subtype : undefined,
                config: {},
            },
        };
        setNodes((nds) => [...nds, newNode]);
    };

    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    return (
        <div className="flex h-[calc(100vh-100px)] w-full overflow-hidden border rounded-lg shadow bg-white">
            {/* Canvas Area */}
            <div className="flex-1 flex flex-col h-full relative">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 z-10 w-full shadow-sm">
                    <input
                        type="text"
                        className="text-lg font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-0 px-2 py-1 w-64"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Workflow Name"
                    />
                    <div className="flex items-center gap-3">
                        <div className="dropdown relative group">
                            <button className="px-4 py-2 border rounded shadow-sm bg-white hover:bg-gray-50 text-sm font-medium">
                                + Add Node
                            </button>
                            <div className="hidden group-hover:block absolute right-0 mt-1 w-48 bg-white border rounded shadow-lg">
                                <div className="p-2 border-b text-xs font-bold text-gray-500">Triggers</div>
                                <button onClick={() => addNode('trigger', 'trigger_enrollment')} className="block w-full text-left px-4 py-2 text-sm hover:bg-green-50">Student Enrolls</button>
                                <button onClick={() => addNode('trigger', 'trigger_point_purchase')} className="block w-full text-left px-4 py-2 text-sm hover:bg-green-50">Points Purchase</button>
                                <div className="p-2 border-b text-xs font-bold text-gray-500">Actions</div>
                                <button onClick={() => addNode('action', 'action_send_email')} className="block w-full text-left px-4 py-2 text-sm hover:bg-blue-50">Send Email</button>
                                <button onClick={() => addNode('action', 'action_grant_points')} className="block w-full text-left px-4 py-2 text-sm hover:bg-blue-50">Grant Points</button>
                            </div>
                        </div>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 font-medium transition-colors"
                        >
                            Save Workflow
                        </button>
                    </div>
                </div>

                <div className="flex-1 w-full h-full">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes}
                        fitView
                        className="bg-slate-50"
                    >
                        <Controls />
                        <Background color="#ccc" gap={16} />
                    </ReactFlow>
                </div>
            </div>

            {/* Sidebar Area */}
            {selectedNodeId && (
                <WorkflowConfigSidebar selectedNode={selectedNode} setNodes={setNodes} />
            )}
        </div>
    );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <CanvasFlow {...props} />
        </ReactFlowProvider>
    );
}
