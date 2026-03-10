'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkflowCanvas } from '@/components/workflows/WorkflowCanvas';

export default function WorkflowEditorPage({ params }: { params: { id: string } }) {
    const [workflow, setWorkflow] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchWorkflow();
    }, [params.id]);

    const fetchWorkflow = async () => {
        try {
            const res = await fetch(`/api/workflows/${params.id}`);
            const data = await res.json();
            if (data.ok) {
                setWorkflow(data.workflow);
            } else {
                alert('Failed to load workflow');
                router.push('/admin/settings/workflows');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (updatedWorkflow: any) => {
        try {
            const res = await fetch(`/api/workflows/${params.id}`, {
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

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading Editor Canvas...</div>;
    }

    if (!workflow) return null;

    return (
        <div className="p-4 bg-gray-100 min-h-screen">
            <div className="mb-4">
                <button
                    onClick={() => router.push('/admin/settings/workflows')}
                    className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm bg-white px-3 py-1.5 rounded-md shadow-sm border w-fit"
                >
                    ← Back to Workflows
                </button>
            </div>
            <WorkflowCanvas initialWorkflow={workflow} onSave={handleSave} />
        </div>
    );
}
