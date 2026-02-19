import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken, PAYPAL_API } from '@/lib/paypal';
import profilesService from '@/lib/profilesService';

export async function POST(req: NextRequest) {
    try {
        const { orderID } = await req.json();

        if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true' && orderID?.startsWith('MOCK_ORDER_')) {
            console.log('[PayPal Capture Order] Mock Mode Active');
            return NextResponse.json({ success: true, data: { status: 'COMPLETED', id: orderID } });
        }

        const accessToken = await generateAccessToken();
        const url = `${PAYPAL_API.base}/v2/checkout/orders/${orderID}/capture`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data = await response.json();

        if (response.ok && data.status === 'COMPLETED') {
            // Transaction Successful
            console.log('Capture Success:', data);

            // TODO: Update Database
            // const userId = ... (get from session or Custom ID if passed in create)
            // updateOrder(orderID, 'PAID');
            // grantAccess(userId);

            return NextResponse.json({ success: true, data });
        } else {
            console.error('PayPal Capture Failed:', data);
            return NextResponse.json({ error: 'Failed to capture order', details: data }, { status: 500 });
        }
    } catch (error: any) {
        console.error('PayPal Capture API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
