import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export const runtime = 'nodejs';

// Initialize AWS Lambda Client
const lambdaClient = new LambdaClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    }
});

const LAMBDA_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME || 'RunPythonWorkflowNode';

export async function POST(req: NextRequest) {
    try {
        const { script, data } = await req.json();

        if (!script) {
            return NextResponse.json({ ok: false, error: 'No script provided' }, { status: 400 });
        }

        console.log('[Python Runner] Invoking AWS Lambda to execute script...');

        // In production/Amplify, we use AWS Lambda to avoid spawn issues and for security
        // The Lambda function should be configured with a 3-5s timeout and minimal memory
        const command = new InvokeCommand({
            FunctionName: LAMBDA_FUNCTION_NAME,
            InvocationType: "RequestResponse",
            Payload: Buffer.from(JSON.stringify({
                script: script,
                data: data || {}
            }))
        });

        const response = await lambdaClient.send(command);

        // Parse result from Lambda response payload
        const resultString = Buffer.from(response.Payload || []).toString('utf-8');
        let resultJson;
        
        try {
            resultJson = JSON.parse(resultString);
        } catch (e) {
            console.error('[Python Runner] Failed to parse Lambda response:', resultString);
            return NextResponse.json({
                ok: false,
                error: 'Invalid response from Python executor',
                stderr: resultString
            }, { status: 500 });
        }

        // Handle Lambda-level execution errors (e.g., Timeout, Memory Limit)
        if (response.FunctionError) {
            console.error('[Python Runner] Lambda execution error:', resultJson);
            return NextResponse.json({
                ok: false,
                error: 'Python script execution failed or timed out',
                stdout: resultJson.stdout || '',
                stderr: resultJson.errorMessage || resultJson.stderr || 'Execution Error',
                code: -1
            });
        }

        // Return the standardized result from our Python Lambda handler
        return NextResponse.json({
            ok: resultJson.ok ?? false,
            stdout: resultJson.stdout || '',
            stderr: resultJson.stderr || '',
            output: resultJson.output || null,
            code: resultJson.ok ? 0 : 1
        });

    } catch (error: any) {
        console.error('[Python Runner Error]', error);
        
        // Check for common connectivity/auth errors
        const isAuthError = error?.name === 'CredentialsProviderError' || error?.name === 'UnrecognizedClientException';
        
        return NextResponse.json({
            ok: false,
            error: isAuthError ? 'AWS Credentials missing or invalid' : (error?.message || 'Failed to execute Python script'),
            stderr: error?.stack || 'Internal Server Error'
        }, { status: 500 });
    }
}

