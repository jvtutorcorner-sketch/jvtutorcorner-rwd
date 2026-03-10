import { NextRequest, NextResponse } from 'next/server';
import { confirmLinePayPayment } from '@/lib/linepay';
// In a real implementation you might need db services here to mark order as paid

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const transactionId = searchParams.get('transactionId');
        const orderId = searchParams.get('orderId');

        if (!transactionId || !orderId) {
            return NextResponse.json({ error: 'Missing transactionId or orderId' }, { status: 400 });
        }

        if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true' && transactionId.startsWith('MOCK_TX_')) {
            console.log(`[Line Pay Confirm] Mock Mode Active - Confirming ${orderId}`);
            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${baseURL}/settings/billing?success=true&orderId=${orderId}`);
        }

        // Ideally, we'd retrieve the original order amount from the DB using `orderId`
        // Since we don't have the DB order retrieval implemented here securely,
        // we'll simulate fetching it. In a real scenario, DO NOT trust client input for amount.
        // For line pay confirm, you MUST supply the amount.

        // This is a placeholder:
        const originalAmount = 100; // Replace with await db.orders.get(orderId).amount

        const response = await confirmLinePayPayment(transactionId, originalAmount);

        if (response.returnCode === '0000') {
            console.log('Line Pay Capture Success:', response);

            // TODO: Update Database to mark order as PAID

            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${baseURL}/settings/billing?success=true&orderId=${orderId}`);
        } else {
            console.error('Line Pay Capture Failed:', response);
            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${baseURL}/settings/billing?payment_error=${encodeURIComponent(response.returnMessage)}`);
        }

    } catch (error: any) {
        console.error('Line Pay Confirm API Error:', error);
        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        return NextResponse.redirect(`${baseURL}/settings/billing?payment_error=system_error`);
    }
}
