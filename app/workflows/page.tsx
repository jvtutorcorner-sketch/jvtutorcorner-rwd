'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function WorkflowsList() {
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchWorkflows();
    }, []);

    const fetchWorkflows = async () => {
        try {
            const res = await fetch('/api/workflows');
            const data = await res.json();
            if (data.ok) {
                setWorkflows(data.workflows);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = async () => {
        try {
            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Workflow' })
            });
            const data = await res.json();
            if (data.ok && data.workflow) {
                router.push(`/workflows/${data.workflow.id}`);
            }
        } catch (e) {
            console.error('Failed to create', e);
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            await fetch(`/api/workflows/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentStatus })
            });
            fetchWorkflows();
        } catch (e) {
            console.error('Failed to update', e);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this workflow?')) return;
        try {
            await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
            fetchWorkflows();
        } catch (e) {
            console.error('Failed to delete', e);
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">Workflows</h1>
                    <p className="text-gray-500 text-sm mt-1">Automate tasks using visual node-based workflows.</p>
                </div>
                <button
                    onClick={handleCreateNew}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition-colors font-medium flex items-center gap-2"
                >
                    <span>✨</span> Create New Workflow
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">Loading workflows...</div>
            ) : workflows.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <div className="text-4xl mb-4">⚙️</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">No Workflows Found</h3>
                    <p className="text-gray-500 text-sm mb-4">Get started by creating your first automation workflow.</p>
                    <button onClick={handleCreateNew} className="text-blue-600 hover:underline">Create one now</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {workflows.map(wf => (
                        <div key={wf.id} className="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative">
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-bold text-lg text-gray-800 line-clamp-1 truncate" title={wf.name}>{wf.name}</h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={wf.isActive} onChange={() => toggleActive(wf.id, wf.isActive)} />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                                </label>
                            </div>
                            <p className="text-sm text-gray-500 mb-4 h-10 line-clamp-2">
                                {wf.description || 'No description provided.'}
                            </p>

                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                                <span className="text-xs text-gray-400">
                                    {wf.nodes?.length || 0} Nodes
                                </span>
                                <div className="flex gap-2 relative z-10">
                                    <Link href={`/workflows/${wf.id}`} className="text-sm px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors">
                                        Edit Canvas
                                    </Link>
                                    <button onClick={(e) => { e.preventDefault(); handleDelete(wf.id); }} className="text-sm px-3 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
