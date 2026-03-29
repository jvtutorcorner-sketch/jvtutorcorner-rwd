import { NextResponse } from 'next/server';
import { triggerWorkflow } from '@/lib/workflowEngine';

export async function POST(req: Request) {
    try {
        const { triggerType, data } = await req.json();

        if (!triggerType || !data) {
            return NextResponse.json({ ok: false, message: 'Missing triggerType or data' }, { status: 400 });
        }

        const result = await triggerWorkflow(triggerType, data);

        if (!result.ok) {
            return NextResponse.json(result, { status: 500 });
        }

        return NextResponse.json({ 
            ok: true, 
            message: `Executed ${result.executedCount} workflows`,
            trails: (result as any).trails || []
        });
    } catch (error: any) {
        console.error('[Workflow API Error]', error);
        return NextResponse.json({ ok: false, message: 'Workflow API failure' }, { status: 500 });
    }
}
