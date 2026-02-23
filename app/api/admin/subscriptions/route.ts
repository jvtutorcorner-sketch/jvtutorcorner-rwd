import { NextResponse } from 'next/server';
import {
    getAllSubscriptions,
    getSubscriptionById,
    upsertSubscription,
    deleteSubscription,
    SubscriptionConfig,
} from '@/lib/subscriptionsService';

export async function GET(request: Request) {
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
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
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
}

export async function DELETE(request: Request) {
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
}
