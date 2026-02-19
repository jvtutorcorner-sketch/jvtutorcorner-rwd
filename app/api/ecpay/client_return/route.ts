import { NextRequest, NextResponse } from 'next/server';
import { verifyCheckMacValue } from '@/lib/ecpay';

// ECPay posts to this URL (OrderResultURL) with the payment result to redirect the user.
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const data: Record<string, string> = {};
        formData.forEach((value, key) => {
            data[key] = value.toString();
        });

        console.log('[ECPay Client Return] Received:', data);

        // Optional: Verify signature again before redirecting (Security)
        if (!verifyCheckMacValue(data)) {
            console.error('[ECPay Client Return] Signature verification failed');
            // Redirect to failure page
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ecpay/failure?reason=signature`, 302);
        }

        if (data.RtnCode === '1') {
            // Redirect to Success Page
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ecpay/success`, 302);
        } else {
            // Redirect to Failure Page
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ecpay/failure?code=${data.RtnCode}&msg=${encodeURIComponent(data.RtnMsg)}`, 302);
        }

    } catch (error) {
        console.error('[ECPay Client Return] Error:', error);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ecpay/failure?reason=server_error`, 302);
    }
}
