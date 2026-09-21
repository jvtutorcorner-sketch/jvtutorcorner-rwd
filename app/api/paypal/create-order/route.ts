import { NextResponse } from 'next/server';
import { generateAccessToken, PAYPAL_API } from '@/lib/paypal';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolvePayableOrderForSession } from '@/lib/payments/payableOrder';

async function handleCreateOrder(req: AuthedRequest) {
    try {
        const { orderId } = await req.json();

        if (!orderId) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // 金額與品名以伺服器端的訂單紀錄為準；先前是直接採信呼叫端送來的 amount。
        const resolved = await resolvePayableOrderForSession(orderId, req.session);
        if (!resolved.ok) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status });
        }
        const { amount, currency, itemName } = resolved.order;

        if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true') {
            console.log('[PayPal Create Order] Mock Mode Active');
            // Redirect to a mock page instead of directly to return URL
            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            const mockUrl = `${baseURL}/paypal/mock?token=MOCK_TOKEN_${orderId}&MockOrderId=${orderId}&amount=${amount}&itemName=${encodeURIComponent(itemName)}`;
            return NextResponse.json({ url: mockUrl });
        }

        const accessToken = await generateAccessToken();
        const url = `${PAYPAL_API.base}/v2/checkout/orders`;
        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        const payload = {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    amount: {
                        currency_code: currency || 'USD',
                        value: amount.toString(),
                    },
                    description: itemName.substring(0, 127), // PayPal limit
                    custom_id: orderId, // Crucial for return matching
                },
            ],
            application_context: {
                return_url: `${baseURL}/api/paypal/return`,
                cancel_url: `${baseURL}/courses`,
                user_action: 'PAY_NOW',
                brand_name: 'JV Tutor Corner',
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok) {
            // Find the "approve" link in the links array returned by PayPal
            const approveLink = data.links.find((link: any) => link.rel === 'approve');
            if (approveLink) {
                return NextResponse.json({ url: approveLink.href });
            } else {
                return NextResponse.json({ error: 'No approval link found in PayPal response' }, { status: 500 });
            }
        } else {
            console.error('PayPal Create Order Failed:', data);
            return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('PayPal Create API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const POST = withAuth(handleCreateOrder);
