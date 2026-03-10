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

            // Update Database
            if (orderID) {
                try {
                    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
                    const res = await fetch(`${base}/api/orders/${encodeURIComponent(orderID)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'PAID' }),
                    });
                    if (!res.ok) {
                        console.error('[PayPal Capture] Failed to update order status via API', res.status);
                    } else {
                        console.log(`[PayPal Capture] Successfully updated order ${orderID} to PAID`);
                    }
                } catch (e) {
                    console.error('[PayPal Capture] Error updating order status:', e);
                }
            }

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
