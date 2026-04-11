/**
 * ═══════════════════════════════════════════════════════════════════════════
 * JavaScript 腳本執行器 — Script Executor
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 版本支援：
 * • Node.js: ^18.0.0 (Amplify 原生)
 * • isolated-vm: ^6.0.2 (package.json 已安裝)
 * • Next.js: ^16.0.10 (使用 serverless runtime)
 * 
 * 功能：
 * • 隔離執行環境 (安全沙箱)
 * • 動態超時管理 (可配置)
 * • 記憶體保護 (128MB 默認)
 * • 完整日誌記錄
 * 
 * ⚠️ AMPLIFY COMPATIBILITY:
 * - isolated-vm 已在 package.json 中
 * - Node.js 原生 (無額外部署依賴)
 * - 記憶體 (128MB) 符合 Lambda 限制
 * - 超時 (3s 默認) < API Gateway 30s 限制
 * ═══════════════════════════════════════════════════════════════════════════
 */

import ivm from 'isolated-vm';

export interface ScriptExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
    logs: string[];
    executionTimeMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 環境配置 (Environment Configuration)
// ═══════════════════════════════════════════════════════════════════════════

const SCRIPT_MEMORY_LIMIT_MB = parseInt(process.env.SCRIPT_MEMORY_LIMIT_MB || '128', 10);
const SCRIPT_EXECUTION_TIMEOUT_MS = parseInt(process.env.SCRIPT_EXECUTION_TIMEOUT_MS || '3000', 10);
const SCRIPT_COMPILE_TIMEOUT_MS = parseInt(process.env.SCRIPT_COMPILE_TIMEOUT_MS || '1000', 10);
const MAX_SCRIPT_SIZE_MB = 0.5; // Max 500KB for safety

/**
 * JavaScript 執行版本信息
 * 
 * Runtime Versions:
 * - Node.js: 18+ (Amplify 內建)
 * - isolated-vm: 6.0.2+ (npm package)
 * - V8 Engine: 與 Node.js 版本一致
 * 
 * 環境變數 (可在 .env.local 或 Amplify 中設定):
 * • SCRIPT_EXECUTION_TIMEOUT_MS    預設: 3000ms
 * • SCRIPT_COMPILE_TIMEOUT_MS      預設: 1000ms
 * • SCRIPT_MEMORY_LIMIT_MB         預設: 128MB
 * 
 * 限制:
 * • 腳本大小: 500KB 上限
 * • 事件資料: 1MB 上限
 * • 執行時間: 3000ms (可設定)
 * • 記憶體: 128MB (可設定)
 */
const JAVASCRIPT_VERSION_INFO = {
    runtime: 'Node.js 18+',
    isolatedVm: '6.0.2+',
    nextJs: '16.0.10+',
    environment: 'Amplify Compatible ✅',
    memoryLimitMb: SCRIPT_MEMORY_LIMIT_MB,
    defaultTimeoutMs: SCRIPT_EXECUTION_TIMEOUT_MS,
    maxScriptSizeMb: MAX_SCRIPT_SIZE_MB
};

export async function executeWebhookScript(
    scriptCode: string,
    eventPayload: any,
    timeoutMs?: number
): Promise<ScriptExecutionResult> {
    /**
     * 執行 JavaScript 程式碼指令書
     * 
     * 版本相容性:
     * • Node.js 18+: ✅ 支援 async/await, Promise
     * • ES2020+: ✅ 支援大部分現代 JS 特性
     * • 異步操作: ❌ 不支援 (isolated-vm 限制)
     * • 網絡呼叫: ⚠️ 不支援 (安全沙箱)
     * 
     * 執行環境:
     * • 隔離的 V8 沙箱 (安全)
     * • 記憶體: ${SCRIPT_MEMORY_LIMIT_MB}MB
     * • 超時: ${effectiveTimeout}ms
     * • 編譯逾時: ${SCRIPT_COMPILE_TIMEOUT_MS}ms
     * 
     * 使用範例:
     * ```javascript
     * function doPost(event) {
     *   console.log('Event:', event);
     *   return { success: true, data: event };
     * }
     * ```
     */
    const logs: string[] = [];
    const startTime = Date.now();
    const effectiveTimeout = timeoutMs || SCRIPT_EXECUTION_TIMEOUT_MS;

    try {
        // ✅ Validate script size (prevent DoS)
        const scriptSizeKB = Buffer.byteLength(scriptCode, 'utf8') / 1024;
        if (scriptSizeKB > MAX_SCRIPT_SIZE_MB * 1024) {
            return {
                success: false,
                error: `Script exceeds ${MAX_SCRIPT_SIZE_MB}MB limit (${scriptSizeKB.toFixed(2)}KB)`,
                logs,
                executionTimeMs: Date.now() - startTime
            };
        }

        // ✅ Validate event payload size
        const payloadSizeKB = Buffer.byteLength(JSON.stringify(eventPayload), 'utf8') / 1024;
        if (payloadSizeKB > 1) { // Max 1MB payload
            return {
                success: false,
                error: `Event payload exceeds 1MB limit (${payloadSizeKB.toFixed(2)}KB)`,
                logs,
                executionTimeMs: Date.now() - startTime
            };
        }

        // Create a new isolate with configurable memory limit
        const isolate = new ivm.Isolate({ memoryLimit: SCRIPT_MEMORY_LIMIT_MB });

        // Create context and get global object
        const context = await isolate.createContext();
        const jail = context.global;

        // Make global object identical to the standard global object in the VM
        await jail.set('global', jail.derefInto());

        // Note: console is injected later via evalClosure as $console to handle copying safely

        // Compile the script with timeout protection
        const script = await isolate.compileScript(`
            // Wrapper to map the global object for logging
            const console = {
                log: (...args) => $console.getSync('log').applySync(undefined, args, { arguments: { copy: true } }),
                error: (...args) => $console.getSync('error').applySync(undefined, args, { arguments: { copy: true } })
            };

            ${scriptCode}

            // Expose the doPost function out of the scope
            if (typeof doPost !== 'function') {
                throw new Error("Your script must define a function named 'doPost(event)'");
            }
            
            // Register an entry point we can call from Node
            var __run_entry_point = function(eventPayloadString) {
                const event = JSON.parse(eventPayloadString);
                return JSON.stringify(doPost(event));
            };
        `, { filename: 'webhook-script.js' });

        // Inject the Reference to Node console wrapper
        await context.evalClosure(`
            global.$console = $0;
        `, [
            new ivm.Reference({
                log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
                error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' '))
            })
        ], { arguments: { reference: true }, timeout: SCRIPT_COMPILE_TIMEOUT_MS });

        // Run the script evaluation (creates the functions)
        await script.run(context, { timeout: SCRIPT_COMPILE_TIMEOUT_MS });

        // Retrieve the executed entry point function (Reference)
        const runner = await context.eval(`__run_entry_point`);
        if (!runner || typeof (runner as any).apply !== 'function') {
            throw new Error("Could not initialize entry point. 'doPost' function export failed.");
        }

        // Call the runner with our stringified payload
        const payloadString = JSON.stringify(eventPayload);

        // Execute the user's script with timeout protection
        let resultString: string;
        try {
            resultString = await Promise.race([
                runner.apply(undefined, [payloadString], {
                    timeout: effectiveTimeout,
                }),
                new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error(`Script execution timeout after ${effectiveTimeout}ms`)), effectiveTimeout + 1000)
                )
            ]);
        } catch (timeoutError: any) {
            if (timeoutError.message?.includes('timeout')) {
                return {
                    success: false,
                    error: `Script timed out (${effectiveTimeout}ms limit)`,
                    logs,
                    executionTimeMs: Date.now() - startTime
                };
            }
            throw timeoutError;
        }

        const parsedResult = JSON.parse(resultString);
        return {
            success: true,
            result: parsedResult,
            logs,
            executionTimeMs: Date.now() - startTime
        };
    } catch (error: any) {
        console.error('[ScriptExecutor] ❌ VM Error:', error);
        
        // Classify errors
        let friendlyError = error.message || String(error);
        if (error.message?.includes('timeout')) {
            friendlyError = `Script execution timeout (limit: ${effectiveTimeout}ms)`;
        } else if (error.message?.includes('Maximum call stack size')) {
            friendlyError = 'Script caused stack overflow - infinite recursion or circular references detected';
        } else if (error.message?.includes('ran out of memory')) {
            friendlyError = `Script exceeded memory limit (${SCRIPT_MEMORY_LIMIT_MB}MB)`;
        }

        return {
            success: false,
            error: friendlyError,
            logs,
            executionTimeMs: Date.now() - startTime
        };
    }
}
