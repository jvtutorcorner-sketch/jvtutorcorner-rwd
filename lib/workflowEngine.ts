import { listWorkflows } from './workflowService';
import { Node, Edge } from '@xyflow/react';
import nodemailer from 'nodemailer';
import { exec } from 'child_process';
import util from 'util';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './dynamo';

const execPromise = util.promisify(exec);

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
// ─────────────────────────────────────────────────────────────────────────────
// LINE Push Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getLINEIntegration() {
    const APPS_TABLE = process.env.DYNAMODB_TABLE_APP_INTEGRATIONS || 'jvtutorcorner-app-integrations';
    try {
        const { Items } = await ddbDocClient.send(new ScanCommand({
            TableName: APPS_TABLE,
            FilterExpression: '#type = :type AND #status = :status',
            ExpressionAttributeNames: { '#type': 'type', '#status': 'status' },
            ExpressionAttributeValues: { ':type': 'LINE', ':status': 'ACTIVE' }
        }));
        if (Items && Items.length > 0) return Items[0];
    } catch (err) {
        console.error('[Workflow Engine] Error scanning apps table for LINE:', err);
    }
    return null;
}

async function getUserLineUid(email: string) {
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
    try {
        const targetEmail = String(email).trim().toLowerCase();
        const { Items } = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: { ':email': targetEmail }
        }));
        if (Items && Items.length > 0 && Items[0].lineUid) return Items[0].lineUid;
    } catch (err) {
        console.error('[Workflow Engine] Error scanning profiles table for LINE UID:', err);
    }
    return null;
}

async function sendLinePushMessage(lineUid: string, text: string, channelAccessToken: string) {
    try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({
                to: lineUid,
                messages: [{ type: 'text', text }]
            })
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error('[Workflow Engine] LINE push failed:', res.status, errorText);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[Workflow Engine] Error sending LINE push:', err);
        return false;
    }
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

            case 'action_notification':
                const ntChannel = config?.channel || (actionType === 'action_notification_slack' ? 'slack' : 'discord');
                const ntMessage = parseTemplate(config?.message || 'Default notification from workflow', payloadData);
                const ntWebhookUrl = config?.webhookUrl;

                if (ntChannel === 'line') {
                    const recipientEmail = parseTemplate(config?.userEmail || '{{email}}', payloadData);
                    const title = parseTemplate(config?.title || '', payloadData);
                    const lineConfig = await getLINEIntegration();
                    
                    if (!lineConfig || !lineConfig.config?.channelAccessToken) {
                        throw new Error('LINE integration not found or missing channelAccessToken');
                    }

                    const lineUid = await getUserLineUid(recipientEmail);
                    if (!lineUid) {
                        throw new Error(`User ${recipientEmail} has not bound LINE`);
                    }

                    const finalMessage = title ? `【${title}】\n${ntMessage}` : ntMessage;
                    const success = await sendLinePushMessage(lineUid, finalMessage, lineConfig.config.channelAccessToken);
                    if (!success) throw new Error('Failed to send LINE push message');
                } else if (ntWebhookUrl && (ntChannel === 'slack' || ntChannel === 'discord')) {
                    const discordPayload = ntChannel === 'discord' ? { content: ntMessage } : { text: ntMessage };
                    await fetch(ntWebhookUrl, {
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
                const userPrompt = parseTemplate(config?.userPrompt || config?.prompt, payloadData);
                payloadData.ai_output = `[AI Result] processed: "${userPrompt.substring(0, 30)}..." using default model.`;
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

            case 'action_image_analysis':
                const apiEndpoint = config?.apiEndpoint || 'http://localhost:3000/api/image-analysis';
                const inputField = config?.inputField || 'imageBase64';
                const outputField = config?.outputField || 'analysisResult';
                const imageBase64 = getValueByPath(payloadData, inputField) || parseTemplate(inputField, payloadData);
                
                if (!imageBase64) throw new Error(`Image data not found in path: ${inputField}`);

                // In a real environment, we should determine base URL properly. For this demo we use relative or local
                const targetUrl = apiEndpoint.startsWith('http') ? apiEndpoint : `http://localhost:3000${apiEndpoint.startsWith('/') ? '' : '/'}${apiEndpoint}`;
                
                const imgRes = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64 })
                });
                
                const imgData = await imgRes.json();
                if (!imgRes.ok || !imgData.ok) {
                    throw new Error(`Image analysis failed: ${imgData.error || imgRes.statusText}`);
                }
                
                payloadData[outputField] = imgData.result;
                break;

            case 'action_ai_dispatch': {
                const qField = config?.queryField || 'message.content';
                const outField = config?.outputField || 'dispatchResult';
                
                // Parse template first, if not found then traverse path
                let query = parseTemplate(qField, payloadData);
                if (query === qField || typeof query !== 'string') {
                    // Try to get from path if parseTemplate didn't change anything or returned non-string
                    query = getValueByPath(payloadData, qField?.replace(/\{\{|\}\}/g, '')) || query;
                }
                
                const dispatchRes = await fetch('http://localhost:3000/api/ai-chat/dispatch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });
                
                let dispatchData;
                try { dispatchData = await dispatchRes.json(); } catch(e) {}
                
                if (!dispatchRes.ok) {
                    throw new Error(`AI Dispatch failed: ${dispatchData?.error || dispatchRes.statusText}`);
                }
                
                payloadData[outField] = dispatchData;
                break;
            }

            case 'action_agent_execute': {
                const agentIdField = config?.agentIdField || 'dispatchResult.primary.id';
                const inField = config?.inputField || 'message.content';
                
                // Clean the {{ }} for getting the value by path if needed
                const cleanAgentIdField = agentIdField.replace(/\{\{|\}\}/g, '');
                const cleanInField = inField.replace(/\{\{|\}\}/g, '');
                
                const agentId = parseTemplate(agentIdField, payloadData) || getValueByPath(payloadData, cleanAgentIdField);
                const query = parseTemplate(inField, payloadData) || getValueByPath(payloadData, cleanInField);
                
                const useSmartRouter = !!config?.useSmartRouter;
                const usePromptCache = !!config?.usePromptCache;

                const executeRes = await fetch('http://localhost:3000/api/ai-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        messages: [{ role: 'user', content: query }],
                        agentId: agentId && typeof agentId === 'string' && agentId !== agentIdField ? agentId : undefined,
                        useSmartRouter,
                        usePromptCache
                    })
                });
                
                let executeData;
                try { executeData = await executeRes.json(); } catch(e) {}
                
                if (!executeRes.ok) {
                    throw new Error(`Agent Execution failed: ${executeData?.error || executeRes.statusText}`);
                }
                
                payloadData.agent_output = executeData?.reply;
                payloadData.agent_execution_details = executeData;
                break;
            }

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

export async function executeSingleWorkflow(wf: { id?: string, name?: string, nodes: Node[], edges: Edge[] }, triggerType: string, payload: any) {
    const triggerNodes = wf.nodes.filter(
        (n: Node) => n.type === 'trigger' && (n.data as any)?.triggerType === triggerType
    );

    // If there is no specific trigger and we are manually testing, just use the first node
    const nodesToStart = triggerNodes.length > 0 ? triggerNodes : (payload.manual_test && wf.nodes.length > 0 ? [wf.nodes[0]] : []);

    const logs: any[] = [];
    const executionTrails: any[] = [];

    for (const tNode of nodesToStart) {
        const currentLogs: any[] = [];
        const currentPayload = JSON.parse(JSON.stringify(payload));
        
        currentLogs.push({ 
            nodeId: tNode.id, 
            nodeLabel: (tNode.data as any)?.label || 'Trigger', 
            status: 'success', 
            time: new Date().toISOString(),
            payload: JSON.parse(JSON.stringify(currentPayload))
        });

        let queue: Node[] = [tNode];
        let visited = new Set<string>();

        while (queue.length > 0) {
            const currentNode = queue.shift()!;
            if (visited.has(currentNode.id)) continue;
            visited.add(currentNode.id);

            // Execute logic or action
            const isActionable = ['action', 'ai', 'python', 'http', 'transform', 'notification', 'input', 'output', 'export', 'delay'].includes(currentNode.type || '');
            if (isActionable) {
                try {
                    await executeAction(currentNode, currentPayload, currentLogs);
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
                    const result = evaluateCondition(currentNode, currentPayload);
                    const branchId = result ? 'true' : 'false';
                    if (edge.sourceHandle && edge.sourceHandle !== branchId) continue;
                    
                    currentLogs.push({ 
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
            workflowId: wf.id || 'test_id',
            workflowName: wf.name || 'Test Workflow',
            logs: currentLogs
        });
    }

    return executionTrails;
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
            const trails = await executeSingleWorkflow(wf, triggerType, data);
            executionTrails.push(...trails);
        }

        return { ok: true, executedCount: executionTrails.length, trails: executionTrails };
    } catch (error: any) {
        console.error('[Workflow Engine Error]', error);
        return { ok: false, error: error?.message || 'Workflow engine failure' };
    }
}
