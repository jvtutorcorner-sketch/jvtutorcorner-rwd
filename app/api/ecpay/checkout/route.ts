import { NextRequest, NextResponse } from 'next/server';
import { generateCheckMacValue, generateMerchantTradeNo, ECPAY_API_URL, getBaseEcpayParams } from '@/lib/ecpay';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { amount, itemName, userId, orderId } = body;

        // Validation
        if (!amount || !itemName || !orderId) {
            return NextResponse.json({ error: 'Missing amount, itemName or orderId' }, { status: 400 });
        }

        if (process.env.NEXT_PUBLIC_PAYMENT_MOCK_MODE === 'true') {
            console.log('[ECPay Checkout] Mock Mode Active');
            const mockSuccessHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>ECPay Mock Payment</title>
                    <style>
                        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; }
                        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
                        .btn { background: #40b070; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>綠界模擬付款頁面 (MOCK)</h2>
                        <p>訂單金額: TWD ${amount}</p>
                        <p>商品名稱: ${itemName}</p>
                        <p style="color: #666; margin-bottom: 2rem;">這是在 .env.local 中開啟 NEXT_PUBLIC_PAYMENT_MOCK_MODE 後的模擬畫面。</p>
                        <a href="/ecpay/success" class="btn">模擬付款成功並返回</a>
                    </div>
                </body>
                </html>
            `;
            return new NextResponse(mockSuccessHtml, { headers: { 'Content-Type': 'text/html' } });
        }

        const tradeNo = generateMerchantTradeNo();
        const date = new Date();
        // Format: YYYY/MM/DD HH:mm:ss
        const tradeDate = date.toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).replace(/\//g, '/');
        // toLocaleString might return "2023/01/01 12:00:00" or with dashes depending on locale implementation in Node.
        // Safer manual format:
        const formattedDate = date.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');

        // Base URL for callbacks
        const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        // Construct Params
        const params: Record<string, string | number> = {
            ...getBaseEcpayParams(),
            MerchantTradeNo: tradeNo,
            MerchantTradeDate: formattedDate,
            TotalAmount: amount, // Must be Int
            TradeDesc: 'Course Purchase',
            ItemName: itemName.substring(0, 50), // ECPay limit
            ReturnURL: `${baseURL}/api/ecpay/return`, // Server-to-Server
            ClientBackURL: `${baseURL}/ecpay/success`, // Button link on ECPay page (Optional)
            OrderResultURL: `${baseURL}/api/ecpay/client_return`, // Auto redirect after payment (Optional but requested)
            NeedExtraPaidInfo: 'N',
            ChoosePayment: 'Credit', // Start with Credit Card
            // CustomField1: userId, // Store userId to link order later in ReturnURL
        };

        // Add CustomField1 only if userId exists to avoid undefined
        if (userId) {
            params['CustomField1'] = userId;
        }
        params['CustomField2'] = orderId; // Always pass orderId here

        // Generate CheckMacValue
        const checkMacValue = generateCheckMacValue(params);
        params['CheckMacValue'] = checkMacValue;

        // Generate HTML Form
        // Auto-submit form
        const formHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Processing Payment...</title></head>
      <body>
        <form id="ecpay-form" action="${ECPAY_API_URL}" method="POST">
          ${Object.keys(params).map(key => `<input type="hidden" name="${key}" value="${params[key]}" />`).join('')}
        </form>
        <script>
          document.getElementById("ecpay-form").submit();
        </script>
      </body>
      </html>
    `;

        // Return HTML string (Front-end will render this or handle it)
        return new NextResponse(formHtml, {
            headers: { 'Content-Type': 'text/html' },
        });

    } catch (error: any) {
        console.error('[ECPay Checkout] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
