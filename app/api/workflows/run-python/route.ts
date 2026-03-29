import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        const { script, data } = await req.json();

        if (!script) {
            return NextResponse.json({ ok: false, error: 'No script provided' }, { status: 400 });
        }

        console.log('[Python Runner] Executing script...');

        const runnerScript = `import json
import sys

# Load data from argument
try:
    data = json.loads(sys.argv[1])
except Exception as e:
    data = {}

# User script
${script}
`;

        // Execute python3
        const result = await new Promise((resolve) => {
            const pythonProcess = spawn('python3', [
                '-c',
                runnerScript,
                JSON.stringify(data || {})
            ]);

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (d) => {
                stdout += d.toString();
            });

            pythonProcess.stderr.on('data', (d) => {
                stderr += d.toString();
            });

            pythonProcess.on('error', (err) => {
                resolve({
                    ok: false,
                    stdout,
                    stderr: stderr + '\n' + (err?.message || 'Process error'),
                    code: -1
                });
            });

            pythonProcess.on('close', (code) => {
                resolve({
                    ok: code === 0,
                    stdout,
                    stderr,
                    code
                });
            });

            // Safety timeout: 10 seconds
            const timeout = setTimeout(() => {
                pythonProcess.kill();
                resolve({
                    ok: false,
                    stdout,
                    stderr: stderr + '\n[Execution Timeout]',
                    code: -1
                });
            }, 10000);

            pythonProcess.on('close', () => clearTimeout(timeout));
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[Python Runner Error]', error);
        return NextResponse.json({
            ok: false,
            error: error?.message || 'Failed to execute Python script',
            stderr: error?.stack
        }, { status: 500 });
    }
}
