import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import profilesService from '@/lib/profilesService';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolvePayableOrderForSession } from '@/lib/payments/payableOrder';

// 結帳一律以登入者身分建立，不再接受 request body 指定的 userId
// （先前任何人都能用別人的身分、任意金額開結帳單）。
async function handleCheckout(req: AuthedRequest) {
    try {
        const body = await req.json();
        const { priceId, amount, currency, successUrl, cancelUrl, orderId, itemName } = body;
        const userId = req.session.userId;

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

        // 單次付款的金額以伺服器端的訂單紀錄為準，不採信 request body 的 amount。
        // （priceId 走 Stripe 上設定好的價格，本來就不受呼叫端左右。）
        let payableAmount = amount;
        let payableCurrency = currency;
        let payableItemName = itemName;
        if (!priceId) {
            const resolved = await resolvePayableOrderForSession(orderId, req.session);
            if (!resolved.ok) {
                return NextResponse.json({ error: resolved.error }, { status: resolved.status });
            }
            payableAmount = resolved.order.amount;
            payableCurrency = resolved.order.currency;
            payableItemName = resolved.order.itemName;
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
                    currency: (payableCurrency || 'TWD').toLowerCase(),
                    product_data: {
                        name: payableItemName || 'JV Tutor Corner Purchase',
                    },
                    unit_amount: Math.round(payableAmount * 1), // TWD usually doesn't have decimals in Stripe, but some currencies do. Stripe expects zero-decimal for TWD.
                },
                quantity: 1,
            }];

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: priceId ? 'subscription' : 'payment',
            payment_method_types: ['card'],
            line_items: lineItems,
            success_url: successUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/pricing?payment=success&orderId=${orderId}`,
            cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/pricing?payment=canceled`,
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

export const POST = withAuth(handleCheckout);
