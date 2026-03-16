import { NextResponse } from 'next/server';
import { getWorkflow, updateWorkflow, deleteWorkflow } from '@/lib/workflowService';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        if (!id) {
            return NextResponse.json({ ok: false, message: 'Workflow ID missing' }, { status: 400 });
        }

        const workflow = await getWorkflow(id);
        if (!workflow) {
            return NextResponse.json({ ok: false, message: 'Workflow not found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, workflow });
    } catch (error: any) {
        console.error(`[workflow GET ${id || 'unknown'}] error:`, error);
        return NextResponse.json({ ok: false, message: 'Failed to fetch workflow' }, { status: 500 });
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        if (!id) {
            return NextResponse.json({ ok: false, message: 'Workflow ID missing' }, { status: 400 });
        }

        const body = await req.json();
        if (!body) {
            return NextResponse.json({ ok: false, message: 'Missing update body' }, { status: 400 });
        }

        const updated = await updateWorkflow(id, body);
        return NextResponse.json({ ok: true, workflow: updated });
    } catch (error: any) {
        console.error(`[workflow PUT ${id || 'unknown'}] error:`, error);
        return NextResponse.json({ ok: false, message: 'Failed to update workflow' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        if (!id) {
            return NextResponse.json({ ok: false, message: 'Workflow ID missing' }, { status: 400 });
        }

        await deleteWorkflow(id);
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error(`[workflow DELETE ${id || 'unknown'}] error:`, error);
        return NextResponse.json({ ok: false, message: 'Failed to delete workflow' }, { status: 500 });
    }
}
