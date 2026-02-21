import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken, PAYPAL_API } from '@/lib/paypal';

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const mockOrderId = url.searchParams.get('MockOrderId');
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    if (!token) {
        return NextResponse.redirect(`${baseURL}/paypal/failure?reason=missing_token`, 302);
    }

    try {
        if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true' && mockOrderId && token.startsWith('MOCK_TOKEN_')) {
            console.log('[PayPal Return] Mock Mode Active, capturing order', mockOrderId);

            // Mock DB Update
            try {
                const res = await fetch(`${baseURL}/api/orders/${encodeURIComponent(mockOrderId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'PAID' }),
                });
                if (!res.ok) console.error('[PayPal Return Mock] Failed to update order');
            } catch (e) {
                console.error('[PayPal Return Mock] Error updating order status:', e);
            }
            return NextResponse.redirect(`${baseURL}/student_courses`, 302);
        }

        const accessToken = await generateAccessToken();
        const captureUrl = `${PAYPAL_API.base}/v2/checkout/orders/${token}/capture`;

        const response = await fetch(captureUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data = await response.json();

        if (response.ok && data.status === 'COMPLETED') {
            console.log('[PayPal Return] Capture Success:', data.id);

            // Extract orderId that we passed in create-order as custom_id
            const purchaseUnit = data.purchase_units?.[0];
            const orderId = purchaseUnit?.custom_id;

            if (orderId) {
                try {
                    const res = await fetch(`${baseURL}/api/orders/${encodeURIComponent(orderId)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'PAID' }),
                    });
                    if (!res.ok) {
                        console.error('[PayPal Return] Failed to update order status via API', res.status);
                    } else {
                        console.log(`[PayPal Return] Successfully updated order ${orderId} to PAID via API`);
                    }
                } catch (e) {
                    console.error('[PayPal Return] Error updating order status:', e);
                }
            } else {
                console.warn('[PayPal Return] No custom_id (orderId) found in PayPal response.');
            }

            return NextResponse.redirect(`${baseURL}/student_courses`, 302);
        } else {
            console.error('[PayPal Return] Capture Failed:', data);
            return NextResponse.redirect(`${baseURL}/paypal/failure?reason=capture_failed`, 302);
        }
    } catch (error: any) {
        console.error('[PayPal Return] API Error:', error);
        return NextResponse.redirect(`${baseURL}/paypal/failure?reason=server_error`, 302);
    }
}
