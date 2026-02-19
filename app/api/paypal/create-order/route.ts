import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken, PAYPAL_API } from '@/lib/paypal';

export async function POST(req: NextRequest) {
    try {
        const { cart } = await req.json();
        // In production, use the cart info to calculate price from DB to avoid client-side manipulation.
        // For demo, we assume the client sends valid structure or we mock it.

        // Mock values
        const value = '100.00';

        const accessToken = await generateAccessToken();
        const url = `${PAYPAL_API.base}/v2/checkout/orders`;

        const payload = {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    amount: {
                        currency_code: 'USD',
                        value: value,
                    },
                    description: 'Course Purchase',
                },
            ],
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
            return NextResponse.json({ orderID: data.id });
        } else {
            console.error('PayPal Create Order Failed:', data);
            return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
        }
    } catch (error: any) {
        console.error('PayPal Create API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
