import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getStoredUser } from '@/lib/mockAuth'; // Replace with real auth in prod
import profilesService from '@/lib/profilesService';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { priceId, amount, currency, successUrl, cancelUrl, userId, orderId, itemName } = body;

        // 0. Global Mock Mode Check
        if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true') {
            console.log('[Stripe Checkout] Mock Mode Active - Skipping real API call and DB lookup');
            return NextResponse.json({
                sessionId: 'mock_session_' + Date.now(),
                url: 'https://checkout.stripe.com/pay/mock_success_url_from_api'
            });
        }

        // 1. Get current user
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        if (!priceId && !amount) {
            return NextResponse.json({ error: 'Missing priceId or amount' }, { status: 400 });
        }

        // 2. Get user profile
        const user = await profilesService.getProfileById(userId);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        let customerId = user.stripeCustomerId;

        // 3. Create Stripe Customer if not exists
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                metadata: {
                    userId: userId,
                },
            });
            customerId = customer.id;

            await profilesService.putProfile({
                ...user,
                stripeCustomerId: customerId,
            });
        }

        // 4. Create Checkout Session
        const lineItems = priceId 
            ? [{ price: priceId, quantity: 1 }]
            : [{
                price_data: {
                    currency: (currency || 'TWD').toLowerCase(),
                    product_data: {
                        name: itemName || 'JV Tutor Corner Purchase',
                    },
                    unit_amount: Math.round(amount * 1), // TWD usually doesn't have decimals in Stripe, but some currencies do. Stripe expects zero-decimal for TWD.
                },
                quantity: 1,
            }];

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: priceId ? 'subscription' : 'payment',
            payment_method_types: ['card'],
            line_items: lineItems,
            success_url: successUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/settings/billing?success=true&orderId=${orderId}`,
            cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/settings/billing?canceled=true`,
            metadata: {
                userId: userId,
                orderId: orderId,
            },
        });

        return NextResponse.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
        console.error('[Stripe Checkout] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
