import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import profilesService from '@/lib/profilesService';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, returnUrl } = body;

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
