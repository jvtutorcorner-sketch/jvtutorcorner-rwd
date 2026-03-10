import { NextResponse } from 'next/server';
import { listWorkflows, createWorkflow } from '@/lib/workflowService';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowDefinition } from '@/lib/types/workflow';

export async function GET() {
    try {
        const workflows = await listWorkflows();
        return NextResponse.json({ ok: true, workflows });
    } catch (error: any) {
        console.error('[workflows GET] error:', error);
        return NextResponse.json({ ok: false, message: 'Failed to fetch workflows' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        if (!body || !body.name) {
            return NextResponse.json({ ok: false, message: 'Missing required field: name' }, { status: 400 });
        }

        const workflow: WorkflowDefinition = {
            id: body.id || uuidv4(),
            name: body.name,
            description: body.description || '',
            isActive: body.isActive ?? false,
            nodes: body.nodes || [],
            edges: body.edges || [],
            allowedRoles: body.allowedRoles || ['admin'],
            createdAt: '',
            updatedAt: '',
        };

        const created = await createWorkflow(workflow);
        return NextResponse.json({ ok: true, workflow: created });
    } catch (error: any) {
        console.error('[workflows POST] error:', error);
        return NextResponse.json({ ok: false, message: 'Failed to create workflow' }, { status: 500 });
    }
}
