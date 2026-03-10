import { NextResponse } from 'next/server';
import { listWorkflows } from '@/lib/workflowService';
import { WorkflowDefinition } from '@/lib/types/workflow';
import { Node, Edge } from '@xyflow/react';

// Basic action executor
async function executeAction(actionNode: Node, payloadData: any) {
    const { actionType, config } = actionNode.data as any;
    console.log(`[Workflow Engine] Executing Action: ${actionType}`, { config, payloadData });

    switch (actionType) {
        case 'action_send_email':
            // Template parsing mock
            const subject = config?.subject?.replace('{{courseName}}', payloadData.courseName || '') || 'Notification';
            const body = config?.body?.replace('{{studentName}}', payloadData.studentName || '') || 'System message';
            console.log(`[Workflow Engine] 📧 Sending Email to ${payloadData.email || 'unknown'} | Subject: ${subject} | Body: ${body}`);
            // In a real app we would await a mailer service here.
            break;

        case 'action_grant_points':
            const amount = config?.amount || 0;
            console.log(`[Workflow Engine] 💰 Granting ${amount} points to User ID: ${payloadData.userId}`);
            // Assuming we could patch to profile here or directly use DB
            break;

        case 'action_change_course_status':
            const targetStatus = config?.targetStatus || 'published';
            console.log(`[Workflow Engine] 📚 Changing course ${payloadData.courseId} status to ${targetStatus}`);
            break;

        default:
            console.log(`[Workflow Engine] Unknown action type: ${actionType}`);
    }
}

export async function POST(req: Request) {
    try {
        const { triggerType, data } = await req.json();

        if (!triggerType || !data) {
            return NextResponse.json({ ok: false, message: 'Missing triggerType or data' }, { status: 400 });
        }

        console.log(`[Workflow Engine] Received trigger: ${triggerType}`, data);

        // 1. Fetch all workflows
        const allWorkflows = await listWorkflows();

        // 2. Filter active workflows
        const activeWorkflows = allWorkflows.filter(wf => wf.isActive);

        let executedCount = 0;

        // 3. Process each active workflow
        for (const wf of activeWorkflows) {
            // Find trigger nodes matching the current triggerType
            const triggerNodes = wf.nodes.filter(
                (n: Node) => n.type === 'trigger' && n.data?.triggerType === triggerType
            );

            for (const tNode of triggerNodes) {
                console.log(`[Workflow Engine] Workflow "${wf.name}" triggered by node ${tNode.id}`);
                executedCount++;

                // Find immediately connected action nodes
                const connectedEdges = wf.edges.filter((e: Edge) => e.source === tNode.id);

                // This is a simple 1-level traversal. For deep nested workflows, we would use a recursive queue.
                for (const edge of connectedEdges) {
                    const targetNode = wf.nodes.find(n => n.id === edge.target);
                    if (targetNode && targetNode.type === 'action') {
                        await executeAction(targetNode, data);
                    }
                }
            }
        }

        return NextResponse.json({ ok: true, message: `Executed ${executedCount} workflows` });
    } catch (error: any) {
        console.error('[Workflow Engine Engine Error]', error);
        return NextResponse.json({ ok: false, message: 'Workflow engine failure' }, { status: 500 });
    }
}
