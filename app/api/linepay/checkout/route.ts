import { NextResponse } from 'next/server';
import { requestLinePayPayment } from '@/lib/linepay';
import { v4 as uuidv4 } from 'uuid';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { resolvePayableOrderForSession } from '@/lib/payments/payableOrder';

async function handleLinePayCheckout(req: AuthedRequest) {
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
            console.log('[Line Pay Checkout] Mock Mode Active');
            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            // Redirect to a mock confirmation URL
            const mockUrl = `${baseURL}/api/linepay/confirm?transactionId=MOCK_TX_${orderId}&orderId=${orderId}`;
            return NextResponse.json({ url: mockUrl });
        }

        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // Payload based on Line Pay API V3 specification
        const payload = {
            amount: amount,
            currency: currency,
            orderId: orderId,
            packages: [
                {
                    id: `PKG_${orderId}`,
                    amount: amount,
                    name: 'JVTutorCorner Purchase',
                    products: [
                        {
                            id: `PROD_${orderId}`,
                            name: itemName,
                            quantity: 1,
                            price: amount,
                        }
                    ]
                }
            ],
            redirectUrls: {
                confirmUrl: `${baseURL}/api/linepay/confirm`,
                cancelUrl: `${baseURL}/settings/billing?canceled=true`,
            }
        };

        const response = await requestLinePayPayment(payload);

        if (response.returnCode === '0000') {
            // response.info.paymentUrl.web is the redirect URL for desktop/mobile browsers
            return NextResponse.json({ url: response.info.paymentUrl.web });
        } else {
            console.error('Line Pay Create Order Failed:', response);
            return NextResponse.json({ error: 'Failed to create Line Pay order', details: response.returnMessage }, { status: 500 });
        }

    } catch (error: any) {
        console.error('Line Pay Create API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const POST = withAuth(handleLinePayCheckout);
