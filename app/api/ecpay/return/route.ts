import { NextRequest, NextResponse } from 'next/server';
import { verifyCheckMacValue } from '@/lib/ecpay';
import profilesService from '@/lib/profilesService';

// Handle x-www-form-urlencoded data
async function parseFormBody(req: NextRequest) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const data: Record<string, string> = {};
    params.forEach((value, key) => {
        data[key] = value;
    });
    return data;
}

export async function POST(req: NextRequest) {
    try {
        const data = await parseFormBody(req);

        console.log('[ECPay Return] Received:', data);

        // 1. Verify CheckMacValue
        if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true') {
            console.log('[ECPay Return] Mock Mode Active');
            return new NextResponse('1|OK', { headers: { 'Content-Type': 'text/plain' } });
        }

        if (!verifyCheckMacValue(data)) {
            console.error('[ECPay Return] CheckMacValue verification failed');
            return new NextResponse('0|CheckMacValue Error', { status: 200 }); // ECPay expects 200 OK
        }

        // 2. Check RtnCode
        // '1' means Success
        if (data.RtnCode === '1') {
            const merchantTradeNo = data.MerchantTradeNo;
            const amount = data.TradeAmt;
            const userId = data.CustomField1; // We stored userId here in Checkout
            const orderId = data.CustomField2;

            console.log(`[ECPay Return] Payment Success: ${merchantTradeNo} for User ${userId}, matching Order ${orderId}`);

            // 3. Update DB
            if (orderId) {
                try {
                    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
                    const res = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'PAID' }),
                    });
                    if (!res.ok) {
                        console.error('[ECPay Return] Failed to update order status via API', res.status);
                    } else {
                        console.log(`[ECPay Return] Successfully updated order ${orderId} to PAID via API`);
                    }
                } catch (e) {
                    console.error('[ECPay Return] Error updating order status:', e);
                }
            }

        } else {
            console.warn(`[ECPay Return] Payment Failed. Code: ${data.RtnCode}, Msg: ${data.RtnMsg}`);
        }

        // 4. Return "1|OK" to acknowledge (Required by ECPay)
        return new NextResponse('1|OK', {
            headers: { 'Content-Type': 'text/plain' },
        });

    } catch (error: any) {
        console.error('[ECPay Return] Error:', error);
        return new NextResponse('0|Error', { status: 200 });
    }
}
