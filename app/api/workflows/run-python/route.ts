/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Python 腳本執行 API — Python Script Runner
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 版本支援：
 * • Python: 3.9+ (AWS Lambda 執行環境)
 * • Node.js: ^18.0.0 (Amplify 原生)
 * • AWS SDK: @aws-sdk/client-lambda ^3.1019.0
 * • Next.js: ^16.0.10 (API Route)
 * 
 * 功能：
 * • Lambda 委派執行 (安全隔離)
 * • 動態超時管理 (自訂超時 1-300 秒)
 * • 腳本大小檢查 (1MB 上限)
 * • 詳細錯誤分類 (認證、超時、配置等)
 * • Amplify 環境檢測與診斷
 * 
 * ⚠️ AMPLIFY COMPATIBILITY:
 * - 使用外部 AWS Lambda (不增加 Amplify 構件大小)
 * - 需要 AWS 認證設定 (環境變數)
 * - Lambda 函式需預先建立在 AWS 帳戶
 * - 無需本地 Python 環境
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export const runtime = 'nodejs';

// ═══════════════════════════════════════════════════════════════════════════
// Python 執行版本信息 (Python Execution Version Info)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Python 執行環境版本
 * 
 * Lambda Runtime Versions:
 * - Python: 3.9, 3.10, 3.11, 3.12 (AWS Lambda 支援)
 * - Default: 3.11
 * 
 * 常用套件版本 (可在 Lambda 層中設定):
 * • NumPy: 1.24+
 * • Pandas: 2.0+
 * • Pillow: 10.1+
 * • Requests: 2.31+
 * • Boto3: 1.28+
 * 
 * 環境變數 (必須在 Amplify 中設定):
 * • AWS_REGION                  預設: ap-northeast-1
 * • AWS_ACCESS_KEY_ID           必需 (生產環境)
 * • AWS_SECRET_ACCESS_KEY       必需 (生產環境)
 * • AWS_LAMBDA_FUNCTION_NAME    預設: RunPythonWorkflowNode
 * • LAMBDA_TIMEOUT_MS           預設: 30000ms (30秒)
 * 
 * 推薦的 Lambda 配置:
 * • Memory: 512 MB - 3 GB
 * • Timeout: 15-300 秒 (根據任務)
 * • 環境變數: 支援
 * • 層 (Layers): 支援 (Python 依賴)
 */
const PYTHON_VERSION_INFO = {
    lambdaVersion: 'Python 3.11 (default, 3.9-3.12 available)',
    nodeVersion: '18+ (async Lambda caller)',
    awsSdkLambda: '@aws-sdk/client-lambda ^3.1019.0',
    nextJs: '16.0.10+',
    environment: 'Amplify Compatible ✅',
    invokeType: 'RequestResponse (同步)',
    defaultTimeoutMs: 30000,
    maxScriptSizeMb: 1,
    maxDataSizeMb: 6 // Lambda 事件負載上限
};

// Initialize AWS Lambda Client
let lambdaClient: LambdaClient | null = null;

function initializeLambdaClient(): LambdaClient {
    /**
     * 初始化 AWS Lambda 客戶端
     * 
     * AWS SDK 版本: @aws-sdk/client-lambda ^3.1019.0
     * 
     * 認證方式:
     * • 環境變數: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
     * • IAM 角色: Amplify 內建支援
     * • Assume Role: 支援 (進階配置)
     * 
     * 區域支援:
     * • ap-northeast-1 (東京) - 預設
     * • us-east-1 (美東)
     * • eu-west-1 (愛爾蘭)
     * • 其他: AWS 支援的任何區域
     * 
     * 錯誤處理:
     * • CredentialsProviderError: 認證失敗
     * • UnrecognizedClientException: 認證無效
     * • ResourceNotFoundException: Lambda 函式找不到
     * • AccessDenied: 權限不足
     */
    if (lambdaClient) return lambdaClient;


    const region = process.env.AWS_REGION || 'ap-northeast-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';

    if (!accessKeyId || !secretAccessKey) {
        console.error('[Python Runner] ❌ AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
    }

    lambdaClient = new LambdaClient({
        region,
        credentials: {
            accessKeyId,
            secretAccessKey,
        }
    });

    return lambdaClient;
}

const LAMBDA_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME || 'RunPythonWorkflowNode';
const LAMBDA_TIMEOUT_MS = parseInt(process.env.LAMBDA_TIMEOUT_MS || '30000', 10); // Default 30s
const MAX_SCRIPT_SIZE_MB = 1; // Max 1MB script size for safety

// Check if running on Amplify
const isAmplifyEnvironment = !!process.env.AMPLIFY_APPID;

export async function POST(req: NextRequest) {
    /**
     * Python 腳本執行端點
     * 
     * HTTP 方法: POST
     * 路徑: /api/workflows/run-python
     * 
     * 請求格式:
     * ```json
     * {
     *   "script": "print('Hello, World!')",  // Python 程式碼 (1MB 上限)
     *   "data": { "key": "value" },           // 輸入資料 (6MB 上限)
     *   "timeout_ms": 15000                   // 自訂超時 (可選, 1-300000ms)
     * }
     * ```
     * 
     * 回應格式:
     * ```json
     * {
     *   "ok": true,
     *   "stdout": "...",
     *   "stderr": "",
     *   "output": {...},
     *   "code": 0
     * }
     * ```
     * 
     * 支援的 Python 版本:
     * • 3.11 (預設, 推薦)
     * • 3.10
     * • 3.9
     * • 3.12 (最新)
     * 
     * 常見套件 (通常預裝在 Lambda):
     * • json, re, datetime, math, random
     * • NumPy, Pandas, Boto3
     * • Pillow (圖片處理)
     * 
     * 開發環境:
     * • 本地: 需要 .env.local 配置 AWS 認證
     * • Amplify: 自動從環境變數讀取
     * • CI/CD: 使用 IAM 角色或 Secrets
     */
    try {
        const { script, data, timeout_ms } = await req.json();

        // ✅ Input validation
        if (!script) {
            return NextResponse.json(
                { ok: false, error: 'No script provided' },
                { status: 400 }
            );
        }

        // Check script size (prevent DoS)
        const scriptSizeKB = Buffer.byteLength(script, 'utf8') / 1024;
        if (scriptSizeKB > MAX_SCRIPT_SIZE_MB * 1024) {
            return NextResponse.json(
                { ok: false, error: `Script exceeds ${MAX_SCRIPT_SIZE_MB}MB limit (${scriptSizeKB.toFixed(2)}KB)` },
                { status: 413 }
            );
        }

        // Determine timeout (with safety bounds)
        let effectiveTimeout = timeout_ms || LAMBDA_TIMEOUT_MS;
        const MAX_TIMEOUT = 300000; // 5 minutes max
        const MIN_TIMEOUT = 1000;   // 1 second min
        effectiveTimeout = Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, effectiveTimeout));

        console.log(`[Python Runner] 🚀 Invoking Lambda: ${LAMBDA_FUNCTION_NAME} (timeout: ${effectiveTimeout}ms)`);

        try {
            const client = initializeLambdaClient();
            const command = new InvokeCommand({
                FunctionName: LAMBDA_FUNCTION_NAME,
                InvocationType: "RequestResponse",
                Payload: Buffer.from(JSON.stringify({
                    script: script,
                    data: data || {},
                    timeout_ms: effectiveTimeout
                }))
            });

            // Execute with timeout promise race
            const lambdaPromise = client.send(command);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Lambda execution timeout')), effectiveTimeout + 5000)
            );

            const response = await Promise.race([lambdaPromise, timeoutPromise]) as any;

            // Parse result from Lambda response payload
            const resultString = Buffer.from(response.Payload || []).toString('utf-8');
            let resultJson;
            
            try {
                resultJson = JSON.parse(resultString);
            } catch (e) {
                console.error('[Python Runner] ❌ Failed to parse Lambda response:', resultString);
                return NextResponse.json({
                    ok: false,
                    error: 'Invalid response from Python executor',
                    stderr: resultString || 'Response parse error'
                }, { status: 502 });
            }

            // Handle Lambda-level execution errors
            if ((response as any).FunctionError) {
                console.error('[Python Runner] ❌ Lambda execution error:', resultJson);
                
                // Extract error message
                const errorMsg = resultJson?.errorMessage || resultJson?.stderr || 'Unknown Lambda error';
                const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('Task timed out');
                
                return NextResponse.json({
                    ok: false,
                    error: isTimeout ? 'Python script execution timeout' : 'Python script execution failed',
                    stdout: resultJson.stdout || '',
                    stderr: errorMsg,
                    code: -1,
                    amplify_note: isAmplifyEnvironment ? 'Running on Amplify - check Lambda configuration' : undefined
                }, { status: 502 });
            }

            // Success response
            return NextResponse.json({
                ok: resultJson.ok ?? false,
                stdout: resultJson.stdout || '',
                stderr: resultJson.stderr || '',
                output: resultJson.output || null,
                code: resultJson.ok ? 0 : (resultJson.code || 1)
            });

        } catch (lambdaError: any) {
            console.error('[Python Runner] ❌ Lambda invocation failed:', lambdaError);

            // Classify error types
            const errorName = lambdaError?.name || '';
            const errorMsg = lambdaError?.message || '';
            
            let friendlyError = 'Failed to execute Python script';
            let httpStatus = 500;

            if (errorMsg.includes('timeout')) {
                friendlyError = 'Script execution timed out - increase timeout_ms if needed';
                httpStatus = 504;
            } else if (errorName === 'CredentialsProviderError' || errorName === 'UnrecognizedClientException') {
                friendlyError = 'AWS credentials authentication failed - check Lambda permissions';
                httpStatus = 403;
            } else if (errorMsg.includes('ResourceNotFoundException')) {
                friendlyError = `Lambda function not found: ${LAMBDA_FUNCTION_NAME}`;
                httpStatus = 404;
            } else if (errorMsg.includes('AccessDenied') || errorMsg.includes('Forbidden')) {
                friendlyError = 'Permission denied - Lambda IAM role may lack invoke permissions';
                httpStatus = 403;
            }

            return NextResponse.json({
                ok: false,
                error: friendlyError,
                stderr: errorMsg,
                amplify_note: isAmplifyEnvironment ? 'Check Amplify environment variables and Lambda role' : undefined
            }, { status: httpStatus });
        }

    } catch (error: any) {
        console.error('[Python Runner] ❌ Unexpected error:', error);
        
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Internal server error',
            stderr: error?.stack?.split('\n')[0] || 'Unknown error'
        }, { status: 500 });
    }
}

