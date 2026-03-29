import { listWorkflows } from './workflowService';
import { Node, Edge } from '@xyflow/react';

// Helpers for data mapping
function parseTemplate(template: string, data: any) {
    if (!template) return '';
    return template.replace(/\{\{(.*?)\}\}/g, (_, path) => {
        const keys = path.split('.');
        let value = data;
        if (keys.length > 0 && keys[0] !== '') {
            for (const key of keys) {
                value = value?.[key];
            }
        }
        return value ?? '';
    });
}

// Logic evaluator
function evaluateCondition(node: Node, data: any): boolean {
    const { variable, operator, value } = node.data?.config as any || {};
    const actualValue = parseTemplate(variable, data);
    
    switch (operator) {
        case 'greater_than': return Number(actualValue) > Number(value);
        case 'less_than': return Number(actualValue) < Number(value);
        case 'contains': return String(actualValue).includes(String(value));
        default:
        case 'equals': return String(actualValue) === String(value);
    }
}

// Basic action executor
async function executeAction(actionNode: Node, payloadData: any) {
    const { actionType, config } = actionNode.data as any;
    console.log(`[Workflow Engine] Executing Action: ${actionType}`, { config, payloadData });

    switch (actionType) {
        case 'action_send_email':
            const subject = parseTemplate(config?.subject, payloadData);
            const body = parseTemplate(config?.body, payloadData);
            console.log(`[Workflow Engine] 📧 Sending Email | Subject: ${subject}`);
            // In reality, this would call an email service...
            break;

        case 'action_grant_points':
            const amount = config?.amount || 0;
            console.log(`[Workflow Engine] 💰 Granting ${amount} points to User`);
            // In reality, this would call the points API...
            break;

        case 'action_ai_summarize':
            const prompt = parseTemplate(config?.userPrompt, payloadData);
            console.log(`[Workflow Engine] ✨ AI Summarizing with prompt: ${prompt}`);
            // Mock AI response
            payloadData.ai_output = "AI Summary Result based on data"; 
            break;

        case 'action_python_script':
            const script = config?.script || '# No script provided';
            console.log(`[Workflow Engine] 🐍 Running Python Script...`);
            console.log(`--- SCRIPT START ---\n${script}\n--- SCRIPT END ---`);
            // In a real scenario, use child_process.exec('python3 ...')
            payloadData.python_result = "Script execution simulated";
            break;

        case 'action_export_csv':
            console.log(`[Workflow Engine] 📄 Exporting data to CSV...`);
            const csvData = Object.entries(payloadData).map(([k, v]) => `${k},${v}`).join('\n');
            console.log(`[Workflow Engine] Generated CSV:\n${csvData}`);
            break;

        default:
            console.log(`[Workflow Engine] Unknown action type: ${actionType}`);
    }
}

/**
 * Triggers all active workflows that match the given trigger type.
 */
export async function triggerWorkflow(triggerType: string, data: any) {
    try {
        console.log(`[Workflow Engine] Received trigger: ${triggerType}`, data);

        const allWorkflows = await listWorkflows();
        const activeWorkflows = allWorkflows.filter(wf => wf.isActive);

        let executedCount = 0;

        for (const wf of activeWorkflows) {
            const triggerNodes = wf.nodes.filter(
                (n: Node) => n.type === 'trigger' && n.data?.triggerType === triggerType
            );

            for (const tNode of triggerNodes) {
                console.log(`[Workflow Engine] Starting Workflow: ${wf.name} (ID: ${wf.id})`);
                executedCount++;

                // Queue for BFS traversal
                let queue: Node[] = [tNode];
                let visited = new Set<string>();

                while (queue.length > 0) {
                    const currentNode = queue.shift()!;
                    if (visited.has(currentNode.id)) continue;
                    visited.add(currentNode.id);

                    // Execute logic or action
                    if (currentNode.type === 'action' || currentNode.type === 'ai') {
                        await executeAction(currentNode, data);
                    }

                    // Find next edges
                    const outEdges = wf.edges.filter((e: Edge) => e.source === currentNode.id);
                    
                    for (const edge of outEdges) {
                        const nextNode = wf.nodes.find(n => n.id === edge.target);
                        if (!nextNode) continue;

                        // Conditional branching logic
                        if (currentNode.type === 'logic') {
                            const result = evaluateCondition(currentNode, data);
                            const branchId = result ? 'true' : 'false';
                            
                            // Only follow the edge that matches the condition result (if edge has a sourceHandle)
                            if (edge.sourceHandle && edge.sourceHandle !== branchId) {
                                continue;
                            }
                        }

                        queue.push(nextNode);
                    }
                }
            }
        }

        return { ok: true, executedCount };
    } catch (error: any) {
        console.error('[Workflow Engine Error]', error);
        return { ok: false, error: error?.message || 'Workflow engine failure' };
    }
}
