import { NextResponse } from 'next/server';
import { checkAmplifyCompatibility } from '@/lib/amplifyCompatibilityCheck';

/**
 * Diagnostic endpoint for checking Amplify compatibility
 * 
 * GET /api/workflows/check-compatibility
 * 
 * Returns detailed information about workflow feature support
 * Useful for debugging deployment issues.
 */

export async function GET() {
    try {
        const report = await checkAmplifyCompatibility();
        
        // For security, only expose compatibility check in development or with debug flag
        const isDev = process.env.NODE_ENV === 'development';
        const debugMode = process.env.DEBUG_AMPLIFY_CHECK === 'true';
        
        if (!isDev && !debugMode) {
            return NextResponse.json(
                { ok: false, message: 'Compatibility check only available in development' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            ok: true,
            report,
            timestamp: new Date().toISOString(),
            node_env: process.env.NODE_ENV,
            amplify: !!process.env.AWS_AMPLIFY
        });
    } catch (error: any) {
        return NextResponse.json({
            ok: false,
            error: error.message || 'Failed to check compatibility'
        }, { status: 500 });
    }
}

export async function POST() {
    return NextResponse.json(
        { ok: false, message: 'Use GET method for compatibility check' },
        { status: 405 }
    );
}
