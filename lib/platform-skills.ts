import { ddbDocClient } from './dynamo';
import { ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getPricingSettings } from './pricingService';
import { findProfileByEmail } from './profilesService';
import { createWorkflow } from './workflowService';
import { queryKeyLogs } from './keyLogger';
import { v4 as uuidv4 } from 'uuid';
// Tables
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';
const REVIEWS_TABLE = process.env.DYNAMODB_TABLE_TEACHER_REVIEWS || 'jvtutorcorner-teacher-reviews';

/**
 * Tool Definition Schema (matches OpenAI/Gemini tool calling format)
 */
export type PlatformTool = {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
    execute: (args: any) => Promise<any>;
};

/**
 * 1. Search Courses
 */
export const search_courses: PlatformTool = {
    name: 'search_courses',
    description: '根據關鍵字、科目或程度搜尋平台課程。',
    parameters: {
        type: 'object',
        properties: {
            keyword: { type: 'string', description: '搜尋關鍵字（標題或描述）' },
            subject: { type: 'string', description: '科目（英文、數學等）' },
            level: { type: 'string', description: '程度（初級、中級、高級、國小、國中、高中）' },
        }
    },
    execute: async ({ keyword, subject, level }) => {
        try {
            const res = await ddbDocClient.send(new ScanCommand({ TableName: COURSES_TABLE }));
            let items = res.Items || [];
            if (keyword) items = items.filter(i => i.title?.includes(keyword) || i.description?.includes(keyword));
            if (subject) items = items.filter(i => i.subject === subject);
            if (level) items = items.filter(i => i.level === level);
            return { ok: true, count: items.length, courses: items.slice(0, 10) };
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
    }
};

/**
 * 2. Get Course Details
 */
export const get_course_details: PlatformTool = {
    name: 'get_course_details',
    description: '獲取特定課程的詳細資訊。',
    parameters: {
        type: 'object',
        properties: {
            courseId: { type: 'string', description: '課程 ID' },
        },
        required: ['courseId']
    },
    execute: async ({ courseId }) => {
        try {
            const res = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: courseId } }));
            return { ok: true, course: res.Item || null };
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
    }
};

/**
 * 3. Get Student Learning Summary
 */
export const get_student_learning_summary: PlatformTool = {
    name: 'get_student_learning_summary',
    description: '獲取學員的學習摘要、目標與課程記錄。',
    parameters: {
        type: 'object',
        properties: {
            email: { type: 'string', description: '學員 Email' },
        },
        required: ['email']
    },
    execute: async ({ email }) => {
        try {
            const profile = await findProfileByEmail(email);
            if (!profile) return { ok: false, message: '找不到該學員資料' };
            // In a real app, we would query enrollment/records table here. 
            // For now, return profile info.
            return { ok: true, profile };
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
    }
};

/**
 * 4. Get Pricing Options
 */
export const get_pricing_options: PlatformTool = {
    name: 'get_pricing_options',
    description: '獲取平台方案、點數包與目前優惠。',
    parameters: {
        type: 'object',
        properties: {},
    },
    execute: async () => {
        try {
            const pricing = await getPricingSettings();
            return { ok: true, pricing };
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
    }
};

/**
 * 5. Check System Status
 */
export const check_system_status: PlatformTool = {
    name: 'check_system_status',
    description: '檢查平台核心服務（資料庫、網路、API）的連線狀態。',
    parameters: {
        type: 'object',
        properties: {},
    },
    execute: async () => {
        const results: any = { database: 'unknown', storage: 'unknown' };
        try {
            await ddbDocClient.send(new ScanCommand({ TableName: COURSES_TABLE, Limit: 1 }));
            results.database = 'connected';
        } catch (_) { results.database = 'error'; }
        return { ok: true, status: results, timestamp: new Date().toISOString() };
    }
};

/**
 * 6. Generate Workflow
 */
export const generate_workflow: PlatformTool = {
    name: 'generate_workflow',
    description: '根據使用者的描述，自動建立並儲存一個自動化工作流程(Workflow)。',
    parameters: {
        type: 'object',
        properties: {
            workflowName: { type: 'string', description: '工作流程名稱' },
            nodes: {
                type: 'array',
                items: { type: 'object' },
                description: '節點陣列，包含 id, type (trigger/action), position, data (label, triggerType, actionType, config)'
            },
            edges: {
                type: 'array',
                items: { type: 'object' },
                description: '連線陣列，包含 id, source, target'
            }
        },
        required: ['workflowName', 'nodes', 'edges']
    },
    execute: async ({ workflowName, nodes, edges }) => {
        try {
            const newWorkflow = await createWorkflow({
                id: uuidv4(),
                name: workflowName,
                description: 'AI Generated Workflow',
                isActive: false,
                nodes: nodes,
                edges: edges,
                allowedRoles: ['admin'],
                createdAt: '',
                updatedAt: ''
            });
            return { ok: true, message: '工作流程已成功建立！', workflowId: newWorkflow.id };
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
    }
};

/**
 * 7. Query Key Logs (關鍵業務日誌查詢)
 * 查詢儲存於 DynamoDB 的精簡關鍵事件，避免翻閱龐大的 CloudWatch 原始日誌。
 */
export const query_key_logs: PlatformTool = {
    name: 'query_key_logs',
    description: `查詢平台關鍵業務日誌（DynamoDB 精簡版，非 CloudWatch 原始日誌）。
可依時間範圍、嚴重度、業務類別、使用者篩選。
適用問題範例：
- 「過去24小時有哪些付款失敗？」
- 「這個用戶今天做了什麼？」
- 「有沒有 CRITICAL 等級的系統錯誤？」
- 「昨天的課程報名狀況如何？」`,
    parameters: {
        type: 'object',
        properties: {
            hoursBack: {
                type: 'number',
                description: '查詢過去 N 小時的日誌（預設 24，最大 168 / 7天）'
            },
            date: {
                type: 'string',
                description: '查詢指定日期 YYYY-MM-DD（與 hoursBack 互斥，優先使用此欄位）'
            },
            level: {
                type: 'string',
                enum: ['INFO', 'WARN', 'ERROR', 'CRITICAL'],
                description: '日誌嚴重度篩選'
            },
            category: {
                type: 'string',
                enum: ['auth', 'payment', 'enrollment', 'classroom', 'teacher', 'admin', 'api_error', 'webhook', 'recommendation', 'system'],
                description: '業務類別篩選'
            },
            userId: {
                type: 'string',
                description: '依使用者 Email 或 ID 篩選'
            },
            limit: {
                type: 'number',
                description: '最多回傳筆數（預設 50，最大 200）'
            }
        }
    },
    execute: async ({ hoursBack, date, level, category, userId, limit }) => {
        try {
            const result = await queryKeyLogs({
                hoursBack: hoursBack ? Math.min(hoursBack, 168) : 24,
                date,
                level,
                category,
                userId,
                limit: limit ? Math.min(limit, 200) : 50,
            });

            // 為 AI 提供統計摘要
            const byLevel: Record<string, number> = {};
            const byCategory: Record<string, number> = {};
            for (const log of result.logs) {
                byLevel[log.level] = (byLevel[log.level] || 0) + 1;
                byCategory[log.category] = (byCategory[log.category] || 0) + 1;
            }

            return {
                ok: true,
                totalFound: result.totalFound,
                dates: result.dates,
                stats: { byLevel, byCategory },
                // 只回傳 AI 需要的欄位，避免 token 過多
                logs: result.logs.map(l => ({
                    timestamp: l.timestamp,
                    level: l.level,
                    category: l.category,
                    action: l.action,
                    summary: l.summary,
                    userId: l.userId,
                    entityId: l.entityId,
                    entityType: l.entityType,
                    source: l.source,
                    httpStatus: l.httpStatus,
                    metadata: l.metadata,
                })),
            };
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
    }
};

export const PLATFORM_TOOLS: Record<string, PlatformTool> = {
    search_courses,
    get_course_details,
    get_student_learning_summary,
    get_pricing_options,
    check_system_status,
    generate_workflow,
    query_key_logs,
};

export const getToolDefinitions = (allowedTools?: string[]) => {
    return Object.values(PLATFORM_TOOLS)
        .filter(t => !allowedTools || allowedTools.includes(t.name))
        .map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));
};
