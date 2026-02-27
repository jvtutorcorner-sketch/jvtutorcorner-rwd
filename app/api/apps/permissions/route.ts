import { NextResponse } from 'next/server';
import { getAppPermissionsFromDynamoDB, saveAppPermissionsToDynamoDB } from '@/lib/appPermissionsService';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log('📖 [App Permissions API] Loading app permissions...');
        const appConfigs = await getAppPermissionsFromDynamoDB();
        console.log(`📖 [App Permissions API] Loaded ${appConfigs.length} appConfigs`);

        return NextResponse.json({ ok: true, settings: { appConfigs } });
    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ ok: false, error: err?.message || 'read error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('[App Permissions API] 📥 接收到的體積:', JSON.stringify(body).length, '字節');

        if (body.appConfigs && Array.isArray(body.appConfigs)) {
            const saveResult = await saveAppPermissionsToDynamoDB(body.appConfigs);

            if (!saveResult) {
                return NextResponse.json({ ok: false, error: 'Failed to save to DynamoDB' }, { status: 500 });
            }
        }

        return NextResponse.json({ ok: true, settings: body });
    } catch (err: any) {
        console.error('[App Permissions API] ❌ POST 錯誤:', err);
        return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
    }
}
