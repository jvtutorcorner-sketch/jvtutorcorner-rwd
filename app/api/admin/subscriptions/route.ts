import { NextResponse } from 'next/server';
import {
    getAllSubscriptions,
    getSubscriptionById,
    upsertSubscription,
    deleteSubscription,
    SubscriptionConfig,
} from '@/lib/subscriptionsService';
import { withAdmin } from '@/lib/auth/apiGuard';

// 這支是「管理端」訂閱方案設定 CRUD（跟一般使用者查自己方案用的 /api/shared/subscriptions
// 是不同 route）。先前完全沒有 auth，任何人都能新增/覆寫/刪除全站訂閱方案設定，三個 method 都鎖 admin。
export const GET = withAdmin(async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            const subscription = await getSubscriptionById(id);
            if (!subscription) {
                return NextResponse.json(
                    { ok: false, error: 'Subscription not found' },
                    { status: 404 }
                );
            }
            return NextResponse.json({ ok: true, subscription });
        }

        const subscriptions = await getAllSubscriptions();
        // Sort by order
        subscriptions.sort((a, b) => (a.order || 0) - (b.order || 0));

        return NextResponse.json({ ok: true, subscriptions });
    } catch (error: any) {
        console.error('GET /api/admin/subscriptions error:', error);
        return NextResponse.json(
            { ok: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
});

export const POST = withAdmin(async (request) => {
    try {
        const body = await request.json();

        if (body.subscriptions && Array.isArray(body.subscriptions)) {
            // Bulk save - first delete subscriptions that are not in the new payload
            const existingSubscriptions = await getAllSubscriptions();
            const incomingIds = new Set(body.subscriptions.map((s: any) => s?.id).filter(Boolean));

            for (const existing of existingSubscriptions) {
                if (!incomingIds.has(existing.id)) {
                    try {
                        await deleteSubscription(existing.id);
                    } catch (e) {
                        console.error(`Failed to delete obsolete subscription ${existing.id}:`, e);
                    }
                }
            }

            const savedSubscriptions = [];
            for (const sub of body.subscriptions) {
                if (!sub || !sub.id || !sub.label || !sub.type) {
                    continue; // Skip invalid
                }
                const saved = await upsertSubscription(sub as SubscriptionConfig);
                savedSubscriptions.push(saved);
            }
            return NextResponse.json({ ok: true, subscriptions: savedSubscriptions });
        }

        const { subscription } = body;

        if (!subscription || !subscription.id || !subscription.label || !subscription.type) {
            return NextResponse.json(
                { ok: false, error: 'Missing required configuration fields' },
                { status: 400 }
            );
        }

        const saved = await upsertSubscription(subscription as SubscriptionConfig);

        return NextResponse.json({ ok: true, subscription: saved });

    } catch (error: any) {
        console.error('POST /api/admin/subscriptions error:', error);
        return NextResponse.json(
            { ok: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
});

export const DELETE = withAdmin(async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { ok: false, error: 'Missing subscription id' },
                { status: 400 }
            );
        }

        await deleteSubscription(id);

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('DELETE /api/admin/subscriptions error:', error);
        return NextResponse.json(
            { ok: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
});
