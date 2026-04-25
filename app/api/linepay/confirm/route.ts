import { NextRequest, NextResponse } from 'next/server';
import { confirmLinePayPayment } from '@/lib/linepay';
import { handlePaymentSuccess } from '@/lib/paymentSuccessHandler';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

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

        // Fetch order from DB (server-authoritative amount)
        const getCmd = new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } });
        const getRes = await ddbDocClient.send(getCmd);
        const orderItem: any = getRes.Item;

        if (!orderItem) {
            console.error('[Line Pay Confirm] Order not found:', orderId);
            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${baseURL}/settings/billing?payment_error=order_not_found`);
        }

        // Idempotent: if already PAID/COMPLETED, just redirect success
        const currentStatus = (orderItem.status || '').toUpperCase();
        if (['PAID', 'COMPLETED'].includes(currentStatus)) {
            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${baseURL}/settings/billing?success=true&orderId=${orderId}`);
        }

        const originalAmount = Number(orderItem.amount || 0);
        const currency = orderItem.currency || 'TWD';

        const response = await confirmLinePayPayment(transactionId, originalAmount, currency);

        if (response?.returnCode === '0000') {
            console.log('Line Pay Capture Success:', response);

            // Append payment record and mark order as PAID
            const paymentRecord = {
                paymentId: (response.info && (response.info.paymentId || response.info.transactionId)) || transactionId,
                transactionId,
                amount: originalAmount,
                currency,
                method: 'linepay',
                status: 'PAID',
                rawResponse: response,
                createdAt: new Date().toISOString(),
            };

            try {
                await ddbDocClient.send(new UpdateCommand({
                    TableName: ORDERS_TABLE,
                    Key: { orderId },
                    UpdateExpression: 'SET #st = :s, updatedAt = :u, payments = list_append(if_not_exists(payments, :empty), :p)',
                    ExpressionAttributeNames: { '#st': 'status' },
                    ExpressionAttributeValues: {
                        ':s': 'PAID',
                        ':u': new Date().toISOString(),
                        ':p': [paymentRecord],
                        ':empty': []
                    }
                }));
            } catch (dbErr) {
                console.error('[Line Pay Confirm] Failed to update order in DB:', dbErr);
                // continue to redirect user even if DB update failed (ops should reconcile)
            }

            // 🟢 NEW: Handle point grants and other post-payment logic
            try {
                const result = await handlePaymentSuccess({
                    orderId,
                    paymentMethod: 'linepay',
                    transactionId,
                    amount: originalAmount,
                });
                if (result.ok) {
                    console.log(`[Line Pay Confirm] Payment success handler completed. Points added: ${result.pointsAdded || 0}`);
                } else {
                    console.warn(`[Line Pay Confirm] Payment success handler failed: ${result.error}`);
                }
            } catch (handlerErr) {
                console.error('[Line Pay Confirm] Payment success handler error:', handlerErr);
            }

            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${baseURL}/settings/billing?success=true&orderId=${orderId}`);
        } else {
            console.error('Line Pay Capture Failed:', response);
            const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            return NextResponse.redirect(`${baseURL}/settings/billing?payment_error=${encodeURIComponent(response?.returnMessage || 'capture_failed')}`);
        }

    } catch (error: any) {
        console.error('Line Pay Confirm API Error:', error);
        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        return NextResponse.redirect(`${baseURL}/settings/billing?payment_error=system_error`);
    }
}
