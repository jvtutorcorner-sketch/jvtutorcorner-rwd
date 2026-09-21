import { NextResponse } from 'next/server';
import { getAppPermissionsFromDynamoDB, saveAppPermissionsToDynamoDB } from '@/lib/appPermissionsService';
import { withAdmin, type AuthedRequest } from '@/lib/auth/apiGuard';

export const dynamic = 'force-dynamic';

// 先前完全沒有 auth：任何人都能讀取／覆寫全站的 app 權限設定（哪些角色能看到哪些整合分類）。
export const GET = withAdmin(async (_request: AuthedRequest) => {
    try {
        console.log('📖 [App Permissions API] Loading app permissions...');
        const appConfigs = await getAppPermissionsFromDynamoDB();

        if (!appConfigs || !Array.isArray(appConfigs)) {
            console.error('❌ [App Permissions API] Invalid data returned from service');
            return NextResponse.json({ ok: false, error: 'Invalid data structure' }, { status: 500 });
        }

        console.log(`✅ [App Permissions API] Loaded ${appConfigs.length} appConfigs`);
        return NextResponse.json({ ok: true, settings: { appConfigs } });
    } catch (err: any) {
        console.error('❌ [App Permissions API] GET Error:', err);
        return NextResponse.json({
            ok: false,
            error: err?.message || 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
});

export const POST = withAdmin(async (req: AuthedRequest) => {
    try {
        const body = await req.json();
        console.log('[App Permissions API] 📥 Received save request');

        if (!body.appConfigs || !Array.isArray(body.appConfigs)) {
            console.warn('⚠️ [App Permissions API] Missing or invalid appConfigs in body');
            return NextResponse.json({ ok: false, error: 'body.appConfigs is required and must be an array' }, { status: 400 });
        }

        const saveResult = await saveAppPermissionsToDynamoDB(body.appConfigs);

        if (!saveResult) {
            console.error('❌ [App Permissions API] Service failed to save data');
            return NextResponse.json({ ok: false, error: 'Database synchronization failed. Please check server logs.' }, { status: 500 });
        }

        console.log('✅ [App Permissions API] Save successful');
        return NextResponse.json({ ok: true, settings: body });
    } catch (err: any) {
        console.error('❌ [App Permissions API] POST Error:', err);
        return NextResponse.json({
            ok: false,
            error: err?.message || 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
});
