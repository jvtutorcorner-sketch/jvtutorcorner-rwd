'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkflowCanvas } from '@/components/workflows/WorkflowCanvas';
import { getStoredUser } from '@/lib/mockAuth';

export default function WorkflowEditorPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = React.use(paramsPromise);
    const id = params.id;
    const [workflow, setWorkflow] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const user = getStoredUser();
        if (!user || user.role !== 'admin') {
            router.push('/login');
            return;
        }
        fetchWorkflow();
    }, [id, router]);

    const fetchWorkflow = async () => {
        try {
            const res = await fetch(`/api/workflows/${id}`);
            const data = await res.json();
            if (data.ok) {
                setWorkflow(data.workflow);
            } else {
                alert('Failed to load workflow');
                router.push('/workflows');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (updatedWorkflow: any) => {
        try {
            const res = await fetch(`/api/workflows/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: updatedWorkflow.name,
                    nodes: updatedWorkflow.nodes,
                    edges: updatedWorkflow.edges,
                })
            });
            const data = await res.json();
            if (data.ok) {
                alert('Workflow saved successfully!');
            } else {
                alert('Failed to save workflow');
            }
        } catch (e) {
            console.error(e);
            alert('Error saving workflow');
        }
    };

    const handleDuplicate = async () => {
        try {
            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: `${workflow.name} (副本)`, 
                    nodes: workflow.nodes, 
                    edges: workflow.edges,
                    description: workflow.description
                })
            });
            const data = await res.json();
            if (data.ok && data.workflow) {
                router.push(`/workflows/${data.workflow.id}`);
            } else {
                alert('Failed to duplicate workflow');
            }
        } catch (e) {
            console.error('Failed to duplicate workflow', e);
            alert('Error duplicating workflow');
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading Editor Canvas...</div>;
    }

    if (!workflow) return null;

    return (
        <div className="p-4 bg-gray-100 min-h-screen">
            <div className="mb-4 flex gap-3">
                <button
                    onClick={() => router.push('/workflows')}
                    className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm bg-white px-3 py-1.5 rounded-md shadow-sm border w-fit"
                >
                    ← Back to Workflows
                </button>
                <button
                    onClick={handleDuplicate}
                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-sm bg-white px-3 py-1.5 rounded-md shadow-sm border w-fit hover:bg-indigo-50 transition-all"
                    title="複製此工作流"
                >
                    📋 複製
                </button>
            </div>
            <WorkflowCanvas initialWorkflow={workflow} onSave={handleSave} />
        </div>
    );
}
