import { NextResponse } from 'next/server';
import { triggerWorkflow, executeSingleWorkflow } from '@/lib/workflowEngine';

export async function POST(req: Request) {
    try {
        const { triggerType, data, testWorkflow } = await req.json();

        if (!triggerType || !data) {
            return NextResponse.json({ ok: false, message: 'Missing triggerType or data' }, { status: 400 });
        }

        let result;
        if (data.manual_test && testWorkflow) {
            // Run exactly the workflow provided in the request body
            const trails = await executeSingleWorkflow(testWorkflow, triggerType, data);
            result = { ok: true, executedCount: trails.length, trails };
        } else {
            // Normal production trigger mode
            result = await triggerWorkflow(triggerType, data);
        }

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
