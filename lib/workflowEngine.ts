import { listWorkflows } from './workflowService';
import { Node, Edge } from '@xyflow/react';
import nodemailer from 'nodemailer';

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
    const { variable, operator, value } = (node.data as any)?.config || {};
    const actualValue = parseTemplate(variable, data);
    
    switch (operator) {
        case 'greater_than': return Number(actualValue) > Number(value);
        case 'less_than': return Number(actualValue) < Number(value);
        case 'contains': return String(actualValue).includes(String(value));
        case 'not_empty': return !!actualValue && actualValue !== 'undefined' && actualValue !== 'null';
        default:
        case 'equals': return String(actualValue) === String(value);
    }
}

// Helper to extract nested data using dot notation (e.g. "response.data.user.id")
function getValueByPath(obj: any, path: string) {
    if (!path || path === '.') return obj;
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
}


// Email transporter helper
async function getTransporter() {
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
        console.warn('[Workflow Engine] 📧 SMTP credentials (SMTP_USER/PASS) not set. Email will be logged only.');
        return null;
    }

    return nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    });
}

// Basic action executor
async function executeAction(actionNode: Node, payloadData: any, logs: any[]) {
    const { actionType, config } = actionNode.data as any;
    const nodeLabel = (actionNode.data as any)?.label || actionType;
    const timestamp = new Date().toISOString();
    
    logs.push({ 
        nodeId: actionNode.id, 
        nodeLabel, 
        status: 'running', 
        time: timestamp,
        payload: JSON.parse(JSON.stringify(payloadData)) 
    });

    try {
        switch (actionType) {
            case 'action_send_email':
            case 'action_send_gmail':
                const to = parseTemplate(config?.to || process.env.DAILY_REPORT_EMAIL || 'jvtutorcorner@gmail.com', payloadData);
                const subject = parseTemplate(config?.subject, payloadData);
                const body = parseTemplate(config?.body, payloadData);
                
                const transporter = await getTransporter();
                if (transporter) {
                    await transporter.sendMail({
                        from: `"JV Tutor AI Workflow" <${process.env.SMTP_USER}>`,
                        to,
                        subject,
                        html: body,
                    });
                }
                break;

            case 'action_notification_slack':
            case 'action_notification_discord':
            case 'action_notification':
                const channel = config?.channel || (actionType === 'action_notification_slack' ? 'slack' : 'discord');
                const message = parseTemplate(config?.message || 'Default notification from workflow', payloadData);
                const webhookUrl = config?.webhookUrl;

                if (webhookUrl && (channel === 'slack' || channel === 'discord')) {
                    const discordPayload = channel === 'discord' ? { content: message } : { text: message };
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(discordPayload)
                    });
                }
                break;

            case 'action_http_request':
                const url = parseTemplate(config?.url, payloadData);
                const method = config?.method || 'GET';
                const response = await fetch(url, {
                    method,
                    headers: config?.headers || { 'Content-Type': 'application/json' },
                    body: ['POST', 'PUT'].includes(method) ? (typeof config?.body === 'string' ? config.body : JSON.stringify(config?.body || payloadData)) : undefined
                });
                const resData = await response.json();
                payloadData[`response_${actionNode.id}`] = resData;
                payloadData.last_response = resData;
                break;

            case 'action_js_script':
                const jsCode = config?.script || 'return data;';
                const scriptFunc = new Function('data', 'context', jsCode);
                const result = scriptFunc(payloadData, { nodeId: actionNode.id, timestamp: Date.now() });
                if (result && typeof result === 'object') {
                    Object.assign(payloadData, result);
                }
                payloadData.js_result = result;
                break;

            case 'action_ai_summarize':
            case 'action_ai_skill':
                const userPrompt = parseTemplate(config?.userPrompt || config?.prompt, payloadData);
                const skillId = config?.skillId;
                payloadData.ai_output = `[AI Result] processed: "${userPrompt.substring(0, 30)}..." using ${skillId || 'default'} model.`;
                break;

            case 'action_python_script':
                payloadData.python_result = "Python execution result simulated";
                break;

            case 'action_data_transform':
                const path = config?.path || '.';
                const targetKey = config?.targetKey || 'transformed_data';
                const value = getValueByPath(payloadData, path);
                payloadData[targetKey] = value;
                break;

            default:
                // Handle other actions
        }
        
        // Mark success
        const logEntry = logs.find(l => l.nodeId === actionNode.id && l.status === 'running');
        if (logEntry) {
            logEntry.status = 'success';
            logEntry.output = JSON.parse(JSON.stringify(payloadData));
        }
    } catch (err: any) {
        const logEntry = logs.find(l => l.nodeId === actionNode.id && l.status === 'running');
        if (logEntry) {
            logEntry.status = 'error';
            logEntry.error = err.message;
        }
        throw err; // Re-throw to stop flow
    }
}

/**
 * Triggers all active workflows that match the given trigger type.
 */
export async function triggerWorkflow(triggerType: string, data: any) {
    const executionTrails: any[] = [];
    
    try {
        const allWorkflows = await listWorkflows();
        const activeWorkflows = allWorkflows.filter(wf => wf.isActive);

        for (const wf of activeWorkflows) {
            const triggerNodes = wf.nodes.filter(
                (n: Node) => n.type === 'trigger' && (n.data as any)?.triggerType === triggerType
            );

            for (const tNode of triggerNodes) {
                const logs: any[] = [];
                const payload = JSON.parse(JSON.stringify(data));
                
                logs.push({ 
                    nodeId: tNode.id, 
                    nodeLabel: (tNode.data as any)?.label || 'Trigger', 
                    status: 'success', 
                    time: new Date().toISOString(),
                    payload: JSON.parse(JSON.stringify(payload))
                });

                let queue: Node[] = [tNode];
                let visited = new Set<string>();

                while (queue.length > 0) {
                    const currentNode = queue.shift()!;
                    if (visited.has(currentNode.id)) continue;
                    visited.add(currentNode.id);

                    // Execute logic or action
                    const isActionable = ['action', 'ai', 'python', 'http', 'transform', 'notification'].includes(currentNode.type || '');
                    if (isActionable) {
                        try {
                            await executeAction(currentNode, payload, logs);
                        } catch (e) {
                            break; 
                        }
                    }

                    // Find next edges
                    const outEdges = wf.edges.filter((e: Edge) => e.source === currentNode.id);
                    for (const edge of outEdges) {
                        const nextNode = wf.nodes.find(n => n.id === edge.target);
                        if (!nextNode) continue;

                        if (currentNode.type === 'logic') {
                            const result = evaluateCondition(currentNode, payload);
                            const branchId = result ? 'true' : 'false';
                            if (edge.sourceHandle && edge.sourceHandle !== branchId) continue;
                            
                            logs.push({ 
                                nodeId: currentNode.id, 
                                nodeLabel: (currentNode.data as any)?.label || 'Logic', 
                                status: result ? 'success' : 'failed_condition', 
                                result: result,
                                time: new Date().toISOString()
                            });
                        }

                        queue.push(nextNode);
                    }
                }
                
                executionTrails.push({
                    workflowId: wf.id,
                    workflowName: wf.name,
                    logs
                });
            }
        }

        return { ok: true, executedCount: executionTrails.length, trails: executionTrails };
    } catch (error: any) {
        console.error('[Workflow Engine Error]', error);
        return { ok: false, error: error?.message || 'Workflow engine failure' };
    }
}
