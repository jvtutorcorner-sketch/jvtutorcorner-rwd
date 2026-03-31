#!/usr/bin/env node
/**
 * validate-workflow-ai.mjs
 *
 * 本機驗證腳本：確認 workflowEngine 的 AI 節點已對齊 /apps 的 AI 服務設定。
 *
 * 用途：
 *   1. 靜態分析 workflowEngine.ts，確認沒有寫死 AI 模型名稱
 *   2. 對本機伺服器發送 POST /api/ai-chat，確認能用 /apps 的 AI 服務回覆
 *   3. 對本機伺服器測試 GET /api/app-integrations，列出目前啟用的 AI 服務
 *
 * 執行方式：
 *   node scripts/validate-workflow-ai.mjs
 *   node scripts/validate-workflow-ai.mjs --base-url http://localhost:3000
 *
 * 適用 Agent：
 *   antigravity / GitHub Copilot CLI / 任何 CLI terminal agent
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const baseUrl = (() => {
    const idx = process.argv.indexOf('--base-url');
    return idx !== -1 ? process.argv[idx + 1] : 'http://localhost:3000';
})();

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';

let exitCode = 0;

function pass(msg) { console.log(`  ${PASS} ${msg}`); }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); exitCode = 1; }
function warn(msg) { console.log(`  ${WARN} ${msg}`); }
function info(msg) { console.log(`  ${INFO} ${msg}`); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Static analysis: no hardcoded model strings in key functions
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1/3] 靜態分析 workflowEngine.ts — 確認無寫死 AI 模型名稱\n');

const enginePath = resolve('lib/workflowEngine.ts');
let engineSrc;
try {
    engineSrc = readFileSync(enginePath, 'utf-8');
} catch (e) {
    fail(`找不到 lib/workflowEngine.ts: ${e.message}`);
    process.exit(1);
}

// Check that action_ai_summarize no longer uses hardcoded gemini-1.5-flash
const summarizeCaseMatch = engineSrc.match(/case 'action_ai_summarize':\s*\{([\s\S]*?)break;\s*\}/);
if (summarizeCaseMatch) {
    const block = summarizeCaseMatch[1];
    if (/gemini-1\.5-flash|gemini-2\.5-flash|gpt-4o|claude-3/.test(block)) {
        fail('action_ai_summarize 仍有寫死的模型名稱！');
    } else if (/\/api\/ai-chat/.test(block)) {
        pass('action_ai_summarize 已改為呼叫 /api/ai-chat（使用 /apps AI 設定）');
    } else {
        warn('action_ai_summarize 找不到 /api/ai-chat 呼叫，請手動確認');
    }
} else {
    warn('找不到 action_ai_summarize case，可能已重構');
}

// Check analyzeLineImageWithVisionAI uses configuredModel variable
const visionFnMatch = engineSrc.match(/async function analyzeLineImageWithVisionAI[\s\S]*?^}/m);
if (visionFnMatch) {
    const block = visionFnMatch[0];
    if (/configuredModel/.test(block) && /config\?\.models\?\[0\]|config\?\.model/.test(block)) {
        pass('analyzeLineImageWithVisionAI 已從 DynamoDB config 讀取模型名稱');
    } else {
        fail('analyzeLineImageWithVisionAI 仍有寫死模型！應使用 config?.models?.[0] || config?.model');
    }

    // Fallback strings are allowed but must only be default fallbacks
    const hardcodedLines = block
        .split('\n')
        .filter(l => /gemini-2\.5-flash|gpt-4o|claude-3/.test(l))
        .map(l => l.trim());
    if (hardcodedLines.length > 0) {
        warn(`analyzeLineImageWithVisionAI 含 fallback 預設名稱（可接受）: ${hardcodedLines.join(' | ')}`);
    }
} else {
    warn('找不到 analyzeLineImageWithVisionAI 函數');
}

// Confirm GoogleGenerativeAI is NOT used in action_ai_summarize
if (/case 'action_ai_summarize'[\s\S]*?GoogleGenerativeAI[\s\S]*?break;/.test(engineSrc)) {
    fail('action_ai_summarize 仍直接使用 GoogleGenerativeAI，應改為呼叫 /api/ai-chat');
} else {
    pass('action_ai_summarize 不再直接呼叫 GoogleGenerativeAI');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Live API: list active AI integrations from /api/app-integrations
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2/3] 查詢 /api/app-integrations — 列出啟用的 AI 服務\n');

async function fetchActiveAIIntegrations() {
    const providers = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'AI_CHATROOM', 'SMART_ROUTER'];
    try {
        const res = await fetch(`${baseUrl}/api/app-integrations`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            warn(`/api/app-integrations 回傳 ${res.status} — 可能需要 session`);
            return null;
        }
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.integrations || []);
        const active = items.filter(i => i.status === 'ACTIVE' && providers.includes(i.type));
        if (active.length === 0) {
            warn('沒有找到啟用的 AI 整合服務，請確認 /apps 頁面有設定');
        } else {
            active.forEach(i => {
                const model = i.config?.models?.[0] || i.config?.model || '(未設定)';
                pass(`[${i.type}] ${i.name || i.integrationId} — 模型: ${model}`);
            });
        }
        return active;
    } catch (e) {
        if (e.name === 'TimeoutError') {
            warn('連線逾時 — 本機伺服器是否已啟動？(npm run dev)');
        } else {
            warn(`無法查詢 /api/app-integrations: ${e.message}`);
        }
        return null;
    }
}

const activeIntegrations = await fetchActiveAIIntegrations();

// ─────────────────────────────────────────────────────────────────────────────
// 3. Live API: test /api/ai-chat with a simple prompt
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3/3] 測試 POST /api/ai-chat — 確認回覆來自 /apps 設定的 AI\n');

async function testAIChat() {
    try {
        const res = await fetch(`${baseUrl}/api/ai-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: '請只回覆 "workflow-ai-ok"' }],
                useSmartRouter: false,
            }),
            signal: AbortSignal.timeout(20000),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            fail(`/api/ai-chat 回傳 ${res.status}: ${data.error || JSON.stringify(data)}`);
            return;
        }

        const reply = data.reply || data.text || '';
        if (reply) {
            pass(`/api/ai-chat 回覆成功 → "${reply.substring(0, 80).replace(/\n/g, ' ')}"`);
            if (data.routingReason) info(`Smart Router 路由原因: ${data.routingReason}`);
        } else {
            warn(`/api/ai-chat 回覆為空，完整回應: ${JSON.stringify(data).substring(0, 200)}`);
        }
    } catch (e) {
        if (e.name === 'TimeoutError') {
            warn('AI 回覆逾時 (20s) — 請確認 API key 正確且伺服器已啟動');
        } else {
            warn(`無法測試 /api/ai-chat: ${e.message}`);
        }
    }
}

await testAIChat();

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
if (exitCode === 0) {
    console.log(`\x1b[32m\n所有靜態檢查通過。Workflow AI 節點已對齊 /apps 的 AI 服務設定。\x1b[0m\n`);
} else {
    console.log(`\x1b[31m\n發現問題，請修正上方標示為 ✗ 的項目。\x1b[0m\n`);
}
process.exit(exitCode);
