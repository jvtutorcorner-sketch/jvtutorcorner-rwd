// lib/integrations/testHandlers.ts
//
// 各整合類型的「連線測試」邏輯（server-only）。原本內嵌於
// app/api/app-integrations/test/route.ts，抽出為共用模組，供新舊 API 共用。
// 邏輯與原本一致，未更動測試行為。

import 'server-only';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export interface TestResult {
    success: boolean;
    message: string;
    details?: any;
}

// ---------------------------------------------------------------------------
// 通訊渠道
// ---------------------------------------------------------------------------

/** LINE: 呼叫 Get Bot Info API 驗證 Channel Access Token */
async function testLINE(config: Record<string, string>): Promise<TestResult> {
    const token = (config.channelAccessToken || '').trim();
    const secret = (config.channelSecret || '').trim();
    if (!token) return { success: false, message: '缺少 Channel Access Token' };
    if (!secret) return { success: false, message: '缺少 Channel Secret' };

    if (!/^[0-9a-f]{32}$/i.test(secret)) {
        return { success: false, message: 'Channel Secret 格式不正確 (應為 32 位十六進制字元)' };
    }

    try {
        const res = await fetch('https://api.line.me/v2/bot/info', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store'
        });
        if (res.ok) {
            const data = await res.json();
            return {
                success: true,
                message: `Bot 名稱: ${data.displayName || data.basicId || 'OK'}`,
                details: { displayName: data.displayName, basicId: data.basicId, pictureUrl: data.pictureUrl }
            };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `LINE API 回傳 ${res.status}: ${err.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Telegram: 呼叫 getMe API 驗證 Bot Token */
async function testTELEGRAM(config: Record<string, string>): Promise<TestResult> {
    const token = config.botToken;
    if (!token) return { success: false, message: '缺少 Bot Token' };
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' });
        const data = await res.json();
        if (data.ok) {
            return { success: true, message: `Bot: @${data.result.username} (${data.result.first_name})`, details: data.result };
        }
        return { success: false, message: `Telegram API 錯誤: ${data.description || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** WhatsApp Business: 驗證 Phone Number ID 和 Access Token */
async function testWHATSAPP(config: Record<string, string>): Promise<TestResult> {
    const phoneNumberId = config.phoneNumberId;
    const token = config.whatsappAccessToken;
    if (!phoneNumberId || !token) return { success: false, message: '缺少 Phone Number ID 或 Access Token' };
    try {
        const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store'
        });
        if (res.ok) {
            const data = await res.json();
            return { success: true, message: `電話號碼: ${data.display_phone_number || phoneNumberId} 驗證成功`, details: data };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `WhatsApp API 回傳 ${res.status}: ${err.error?.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Messenger: 驗證 Page Access Token */
async function testMESSENGER(config: Record<string, string>): Promise<TestResult> {
    const token = config.pageAccessToken;
    if (!token) return { success: false, message: '缺少 Page Access Token' };
    try {
        const res = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${token}`, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            return { success: true, message: `粉絲專頁: ${data.name || data.id} 驗證成功`, details: data };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `Graph API 回傳 ${res.status}: ${err.error?.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Slack: 呼叫 auth.test 驗證 Bot Token */
async function testSLACK(config: Record<string, string>): Promise<TestResult> {
    const token = config.botOAuthToken;
    if (!token) return { success: false, message: '缺少 Bot OAuth Token' };
    try {
        const res = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            cache: 'no-store'
        });
        const data = await res.json();
        if (data.ok) {
            return { success: true, message: `Workspace: ${data.team} / Bot: ${data.user}`, details: data };
        }
        return { success: false, message: `Slack API 錯誤: ${data.error || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Teams: 驗證 App ID 和 App Password (透過 Microsoft OAuth) */
async function testTEAMS(config: Record<string, string>): Promise<TestResult> {
    const appId = config.appId;
    const appPassword = config.appPassword;
    if (!appId || !appPassword) return { success: false, message: '缺少 App ID 或 App Password' };
    try {
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: appId,
            client_secret: appPassword,
            scope: 'https://api.botframework.com/.default',
        });
        const res = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            cache: 'no-store'
        });
        if (res.ok) return { success: true, message: `App ID ${appId} 驗證成功，已取得 Access Token` };
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `Microsoft OAuth 回傳 ${res.status}: ${err.error_description || err.error || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Discord: 呼叫 /users/@me 驗證 Bot Token */
async function testDISCORD(config: Record<string, string>): Promise<TestResult> {
    const token = config.discordBotToken;
    if (!token) return { success: false, message: '缺少 Bot Token' };
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token}` },
            cache: 'no-store'
        });
        if (res.ok) {
            const data = await res.json();
            return { success: true, message: `Bot: ${data.username}#${data.discriminator} 驗證成功`, details: data };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `Discord API 回傳 ${res.status}: ${err.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** WeChat: 取得 access_token 驗證 AppID 和 AppSecret */
async function testWECHAT(config: Record<string, string>): Promise<TestResult> {
    const appId = config.wechatAppId;
    const appSecret = config.wechatAppSecret;
    if (!appId || !appSecret) return { success: false, message: '缺少 AppID 或 AppSecret' };
    try {
        const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.access_token) return { success: true, message: `AppID ${appId} 驗證成功，已取得 access_token` };
        return { success: false, message: `微信 API 錯誤 ${data.errcode}: ${data.errmsg || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

// ---------------------------------------------------------------------------
// 金流服務
// ---------------------------------------------------------------------------

/** ECPay: 驗證 MerchantID 格式（ECPay 不提供公開驗證 API，僅做格式校驗 + 連線） */
async function testECPAY(config: Record<string, string>): Promise<TestResult> {
    const merchantId = config.merchantId;
    const hashKey = config.hashKey;
    const hashIV = config.hashIV;
    if (!merchantId) return { success: false, message: '缺少特店編號 (MerchantID)' };
    if (!hashKey) return { success: false, message: '缺少 HashKey' };
    if (!hashIV) return { success: false, message: '缺少 HashIV' };
    if (merchantId.length < 4) return { success: false, message: 'MerchantID 格式不正確 (太短)' };
    if (hashKey.length < 8) return { success: false, message: 'HashKey 格式不正確 (太短)' };
    if (hashIV.length < 8) return { success: false, message: 'HashIV 格式不正確 (太短)' };
    try {
        const res = await fetch('https://payment.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `MerchantID=${merchantId}&TimeStamp=${Math.floor(Date.now() / 1000)}`,
            cache: 'no-store'
        });
        if (res.ok || res.status < 500) {
            return { success: true, message: `特店編號 ${merchantId} 格式正確，ECPay 伺服器可連線` };
        }
        return { success: false, message: `ECPay 伺服器回傳 ${res.status}` };
    } catch (e: any) {
        return { success: true, message: `特店編號 ${merchantId} 參數格式驗證通過 (伺服器連線異常: ${e.message})` };
    }
}

/** Stripe: 呼叫 /v1/balance 驗證 Secret Key */
async function testSTRIPE(config: Record<string, string>): Promise<TestResult> {
    const secretKey = config.secretKey;
    if (!secretKey) return { success: false, message: '缺少 Secret Key' };
    if (!secretKey.startsWith('sk_')) return { success: false, message: 'Secret Key 格式不正確 (應以 sk_ 開頭)' };
    try {
        const res = await fetch('https://api.stripe.com/v1/balance', {
            headers: { Authorization: `Bearer ${secretKey}` },
            cache: 'no-store'
        });
        if (res.ok) {
            const data = await res.json();
            const currency = data.available?.[0]?.currency?.toUpperCase() || 'N/A';
            const amount = data.available?.[0]?.amount ?? 0;
            return { success: true, message: `Stripe 帳戶驗證成功 (${currency} 餘額: ${amount / 100})` };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `Stripe API 回傳 ${res.status}: ${err.error?.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** PayPal: 透過 Client Credentials 取得 Access Token 驗證 */
async function testPAYPAL(config: Record<string, string>): Promise<TestResult> {
    const clientId = config.clientId;
    const secretKey = config.secretKey;
    if (!clientId) return { success: false, message: '缺少 Client ID' };
    if (!secretKey) return { success: false, message: '缺少 Secret Key' };
    try {
        const auth = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
        const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=client_credentials',
            cache: 'no-store'
        });
        if (res.ok) {
            const data = await res.json();
            return { success: true, message: `PayPal 帳戶驗證成功 (App: ${data.app_id || 'OK'})`, details: { app_id: data.app_id } };
        }
        const sandboxRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=client_credentials',
        });
        if (sandboxRes.ok) {
            const data = await sandboxRes.json();
            return { success: true, message: `PayPal Sandbox 驗證成功 (App: ${data.app_id || 'OK'})`, details: { app_id: data.app_id, sandbox: true } };
        }
        return { success: false, message: `PayPal API 驗證失敗 (Production 和 Sandbox 均無法驗證)` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Line Pay: 透過 /v3/payments/request 驗證 Channel ID 和 Secret */
async function testLINEPAY(config: Record<string, string>, testParams?: any): Promise<TestResult> {
    const channelId = config.linePayChannelId;
    const channelSecret = config.linePayChannelSecret;
    if (!channelId || !channelSecret) return { success: false, message: '缺少 Channel ID 或 Channel Secret' };

    const amount = Number(testParams?.amount || 1);
    const productName = testParams?.productName || '測試商品';
    const orderId = `TEST_${Date.now()}`;
    const body = {
        amount, currency: 'TWD', orderId,
        packages: [{ id: 'pkg_1', amount, name: 'Test Package', products: [{ name: productName, quantity: 1, price: amount }] }],
        redirectUrls: { confirmUrl: 'https://example.com/confirm', cancelUrl: 'https://example.com/cancel' }
    };
    const uri = '/v3/payments/request';
    const nonce = crypto.randomUUID();
    const signature = crypto.createHmac('sha256', channelSecret).update(channelSecret + uri + JSON.stringify(body) + nonce).digest('base64');

    const tryFetch = async (endpoint: string) => fetch(`${endpoint}${uri}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-LINE-ChannelId': channelId,
            'X-LINE-Authorization-Nonce': nonce,
            'X-LINE-Authorization': signature
        },
        body: JSON.stringify(body),
        cache: 'no-store'
    });

    try {
        let res = await tryFetch('https://api-pay.line.me');
        if (!res.ok && res.status === 401) res = await tryFetch('https://sandbox-api-pay.line.me');
        const data = await res.json();
        if (data.returnCode === '0000') {
            const isSandbox = res.url.includes('sandbox');
            return { success: true, message: `Line Pay ${isSandbox ? 'Sandbox ' : '生產環境'}驗證成功！已成功建立測試交易。`, details: data };
        }
        return { success: false, message: `Line Pay API 錯誤: [${data.returnCode}] ${data.returnMessage}` };
    } catch (e: any) {
        return { success: false, message: `Line Pay 連線失敗: ${e.message}` };
    }
}

/** 街口支付: 建立訂單驗證 API 金鑰 */
async function testJKOPAY(config: Record<string, string>, testParams?: any): Promise<TestResult> {
    const merchantId = config.jkopayMerchantId;
    const secretKey = config.jkopaySecretKey;
    if (!merchantId || !secretKey) return { success: false, message: '缺少 Merchant ID 或 Secret Key' };

    const amount = Number(testParams?.amount || 1);
    const productName = testParams?.productName || '測試商品';
    const orderId = `TEST_${Date.now()}`;
    const body = {
        result_display_url: 'https://example.com/result',
        final_result_url: 'https://example.com/final',
        merchant_order_no: orderId,
        order_amount: amount,
        currency: 'TWD',
        order_products: [{ name: productName, quantity: 1, price: amount }]
    };
    const bodyStr = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secretKey).update(bodyStr).digest('hex');
    try {
        const res = await fetch('https://api.jkopay.com/v1/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'API-KEY': merchantId, 'DIGEST': signature },
            body: bodyStr,
            cache: 'no-store'
        });
        const data = await res.json();
        if (data.result === 'INITIAL') return { success: true, message: '街口支付驗證成功！已成功建立測試訂單。', details: data };
        return { success: false, message: `街口支付 API 錯誤: ${data.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `街口支付連線失敗: ${e.message}` };
    }
}

// ---------------------------------------------------------------------------
// AI 服務
// ---------------------------------------------------------------------------

async function testOPENAI(config: Record<string, any>, prompt?: string): Promise<TestResult> {
    const apiKey = config.apiKey;
    if (!apiKey) return { success: false, message: '缺少 API Key' };
    try {
        if (prompt) {
            const model = Array.isArray(config.models) && config.models.length > 0 ? config.models[0] : 'gpt-4o-mini';
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1000 }),
                cache: 'no-store'
            });
            const data = await res.json();
            if (res.ok) return { success: true, message: data.choices?.[0]?.message?.content || '收到空回應', details: data };
            return { success: false, message: `OpenAI API 錯誤: ${data.error?.message || '呼叫失敗'}` };
        }
        const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' });
        if (res.ok) return { success: true, message: 'OpenAI API Key 驗證成功' };
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `OpenAI API 錯誤: ${err.error?.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

async function testANTHROPIC(config: Record<string, any>, prompt?: string): Promise<TestResult> {
    const apiKey = config.apiKey;
    if (!apiKey) return { success: false, message: '缺少 API Key' };
    try {
        if (prompt) {
            const model = Array.isArray(config.models) && config.models.length > 0 ? config.models[0] : 'claude-3-5-haiku-20241022';
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1000 }),
                cache: 'no-store'
            });
            const data = await res.json();
            if (res.ok) return { success: true, message: data.content?.[0]?.text || '收到空回應', details: data };
            return { success: false, message: `Anthropic API 錯誤: ${data.error?.message || '呼叫失敗'}` };
        }
        const res = await fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            cache: 'no-store'
        });
        if (res.ok) return { success: true, message: 'Anthropic API Key 驗證成功' };
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `Anthropic API 錯誤: ${err.error?.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

async function testGEMINI(config: Record<string, any>, prompt?: string): Promise<TestResult> {
    const apiKey = (config.apiKey || config.geminiApiKey || '').trim();
    if (!apiKey) return { success: false, message: '缺少 API Key' };
    try {
        if (prompt) {
            const model = Array.isArray(config.models) && config.models.length > 0 ? config.models[0] : 'gemini-1.5-flash';
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2048 } }),
                cache: 'no-store'
            });
            const data = await res.json();
            if (!res.ok) {
                const errMsg = data.error?.message || '呼叫失敗';
                if (data.error?.status === 'NOT_FOUND') return { success: false, message: `模型 "${model}" 不存在或無法存取: ${errMsg}` };
                return { success: false, message: `Gemini API 錯誤: ${errMsg}` };
            }
            const candidate = data.candidates?.[0];
            const finishReason = candidate?.finishReason;
            const parts = candidate?.content?.parts || [];
            const fullText = parts.map((p: any) => p.text || '').join('').trim();
            if (!fullText) return { success: false, message: `Gemini 回傳空內容 (finishReason: ${finishReason || '未知'}, 可能被安全過濾)` };
            const suffix = finishReason === 'MAX_TOKENS' ? `\n\n[回應已達 Token 上限 (MAX_TOKENS)，內容可能未完整]` : '';
            return { success: true, message: fullText + suffix, details: { finishReason, model, candidateCount: data.candidates?.length } };
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { cache: 'no-store' });
        if (res.ok) return { success: true, message: 'Google Gemini API Key 驗證成功' };
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `Gemini API 錯誤: ${err.error?.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

async function testSMTP(config: Record<string, string>, emailTest?: { to: string; subject: string; html: string; bcc?: string }, type: string = 'SMTP'): Promise<TestResult> {
    const host = config.smtpHost;
    const port = parseInt(config.smtpPort, 10);
    const user = config.smtpUser;
    const pass = config.smtpPass;
    const from = config.fromAddress || user;
    if (!host || !port || !user || !pass) return { success: false, message: '缺少 SMTP 主機、通訊埠、帳號或密碼' };
    try {
        const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 10000 });
        await transporter.verify();
        if (emailTest && emailTest.to) {
            const { getBaseEmail } = await import('@/lib/email/whitelist');
            const targetRecipient = getBaseEmail(emailTest.to);
            const sendInfo = await transporter.sendMail({
                from: `"System Test" <${from}>`,
                to: targetRecipient,
                subject: emailTest.subject || '系統整合測試郵件',
                html: emailTest.html || `<p>這是一封測試郵件，證明您的 <strong>${type}</strong> 設定已成功生效！</p>`,
                bcc: emailTest.bcc,
            });
            return { success: true, message: `郵件已成功發送至 ${targetRecipient}`, details: { messageId: sendInfo.messageId, response: sendInfo.response } };
        }
        return { success: true, message: `SMTP 伺服器 (${host}) 連線測試成功` };
    } catch (e: any) {
        let errorMsg = e.message || '連線失敗';
        if (host.includes('gmail.com') && (errorMsg.includes('Invalid login') || errorMsg.includes('auth'))) {
            errorMsg += ' (若是 Gmail，請確認是否已使用「應用程式密碼」)';
        } else if (host.includes('resend.com') && (errorMsg.includes('550') || errorMsg.toLowerCase().includes('domain is not verified'))) {
            errorMsg = `Resend 網域未驗證: ${errorMsg}。如果您沒有自訂網域，請將寄件者改為 onboarding@resend.dev。驗證請至：https://resend.com/domains`;
        } else if (host.includes('resend.com') && (errorMsg.includes('Invalid login') || errorMsg.includes('auth'))) {
            errorMsg += ' (若是 Resend，請確認 User 為 "resend" 且 Password 為正確的 API Key)';
        }
        return { success: false, message: `SMTP 測試失敗: ${errorMsg}` };
    }
}

/** Context7 MCP: 驗證 API Key 格式 */
async function testCONTEXT7(config: Record<string, any>): Promise<TestResult> {
    const apiKey = config.context7ApiKey;
    if (!apiKey) return { success: false, message: '缺少 Context7 API Key' };
    if (apiKey.length < 5) return { success: false, message: 'Context7 API Key 格式不正確' };
    return { success: true, message: 'Context7 API Key 格式驗證通過。此 Key 將用於 Figma 設計稿調取與知識庫檢索。' };
}

// ---------------------------------------------------------------------------
// 分發器
// ---------------------------------------------------------------------------

type Handler = (config: Record<string, any>, prompt?: string, emailTest?: any, testParams?: any) => Promise<TestResult>;

export const TEST_HANDLERS: Record<string, Handler> = {
    LINE: (config) => testLINE(config as Record<string, string>),
    TELEGRAM: (config) => testTELEGRAM(config as Record<string, string>),
    WHATSAPP: (config) => testWHATSAPP(config as Record<string, string>),
    MESSENGER: (config) => testMESSENGER(config as Record<string, string>),
    SLACK: (config) => testSLACK(config as Record<string, string>),
    TEAMS: (config) => testTEAMS(config as Record<string, string>),
    DISCORD: (config) => testDISCORD(config as Record<string, string>),
    WECHAT: (config) => testWECHAT(config as Record<string, string>),
    ECPAY: (config) => testECPAY(config as Record<string, string>),
    STRIPE: (config) => testSTRIPE(config as Record<string, string>),
    PAYPAL: (config) => testPAYPAL(config as Record<string, string>),
    LINEPAY: (config, _p, _e, testParams) => testLINEPAY(config as Record<string, string>, testParams),
    JKOPAY: (config, _p, _e, testParams) => testJKOPAY(config as Record<string, string>, testParams),
    OPENAI: testOPENAI,
    ANTHROPIC: testANTHROPIC,
    GEMINI: testGEMINI,
    SMTP: (config, _p, emailTest) => testSMTP(config as Record<string, string>, emailTest, 'SMTP'),
    GMAIL: (config, _p, emailTest) => testSMTP(config as Record<string, string>, emailTest, 'GMAIL'),
    RESEND: (config, _p, emailTest) => testSMTP(config as Record<string, string>, emailTest, 'RESEND'),
    CONTEXT7: (config) => testCONTEXT7(config),
};

export function hasTestHandler(type: string): boolean {
    return !!TEST_HANDLERS[String(type || '').toUpperCase()];
}

/** 統一入口：找不到 handler 回 null，由呼叫端決定回應 */
export async function runTest(
    type: string,
    config: Record<string, any>,
    opts: { prompt?: string; emailTest?: any; testParams?: any } = {}
): Promise<TestResult | null> {
    const handler = TEST_HANDLERS[String(type || '').toUpperCase()];
    if (!handler) return null;
    return handler(config, opts.prompt, opts.emailTest, opts.testParams);
}
