import { NextResponse } from 'next/server';
import { triggerWorkflow, executeSingleWorkflow } from '@/lib/workflowEngine';
import { withAdmin } from '@/lib/auth/apiGuard';

// 只有 WorkflowCanvas 的手動測試按鈕會呼叫這支（admin 頁面）；先前完全沒有 auth，
// 任何人都能直接觸發任意已設定好的自動化流程（含寄信、外呼 API 等有副作用的動作）。
export const POST = withAdmin(async (req) => {
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
});
