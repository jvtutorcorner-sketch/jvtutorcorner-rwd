import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import profilesService from '@/lib/profilesService';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';

/**
 * 這支會回傳 Stripe 帳務入口網址（可看付款方式、發票、取消訂閱）。
 * 先前 userId 是從 request body 拿的且沒有驗證，任何人送出別人的 userId
 * 就能拿到對方的帳務入口。現在一律綁定登入者本人，只有管理員能代查他人。
 */
async function handlePortal(req: AuthedRequest) {
    try {
        const body = await req.json();
        const { returnUrl } = body;

        const { role, userId: sessionUserId } = req.session;
        const isPrivileged = role === 'admin' || role === 'system';
        const userId = isPrivileged && body.userId ? body.userId : sessionUserId;

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        // 1. Get user profile
        const user = await profilesService.getProfileById(userId);
        if (!user || !user.stripeCustomerId) {
            return NextResponse.json({ error: 'User or Stripe Customer ID not found' }, { status: 404 });
        }

        // 2. Create Portal Session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: returnUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/settings/billing`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error: any) {
        console.error('[Stripe Portal] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const POST = withAuth(handlePortal);
