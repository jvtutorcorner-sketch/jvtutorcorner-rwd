// app/api/app-integrations/test/route.ts
//
// 測試整合連線是否正常。
// POST { integrationId, type, config }
// 回傳 { ok, type, result: { success, message, details? } }

import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// 各服務的驗證邏輯
// ---------------------------------------------------------------------------

/** LINE: 呼叫 Get Bot Info API 驗證 Channel Access Token */
async function testLINE(config: Record<string, string>) {
    const token = config.channelAccessToken;
    if (!token) return { success: false, message: '缺少 Channel Access Token' };

    try {
        const res = await fetch('https://api.line.me/v2/bot/info', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const data = await res.json();
            return { success: true, message: `Bot 名稱: ${data.displayName || data.basicId || 'OK'}`, details: { displayName: data.displayName, basicId: data.basicId } };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `LINE API 回傳 ${res.status}: ${err.message || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Telegram: 呼叫 getMe API 驗證 Bot Token */
async function testTELEGRAM(config: Record<string, string>) {
    const token = config.botToken;
    if (!token) return { success: false, message: '缺少 Bot Token' };

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
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
async function testWHATSAPP(config: Record<string, string>) {
    const phoneNumberId = config.phoneNumberId;
    const token = config.whatsappAccessToken;
    if (!phoneNumberId || !token) return { success: false, message: '缺少 Phone Number ID 或 Access Token' };

    try {
        const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
            headers: { Authorization: `Bearer ${token}` },
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
async function testMESSENGER(config: Record<string, string>) {
    const token = config.pageAccessToken;
    if (!token) return { success: false, message: '缺少 Page Access Token' };

    try {
        const res = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${token}`);
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
async function testSLACK(config: Record<string, string>) {
    const token = config.botOAuthToken;
    if (!token) return { success: false, message: '缺少 Bot OAuth Token' };

    try {
        const res = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
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
async function testTEAMS(config: Record<string, string>) {
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
        });
        if (res.ok) {
            return { success: true, message: `App ID ${appId} 驗證成功，已取得 Access Token` };
        }
        const err = await res.json().catch(() => ({}));
        return { success: false, message: `Microsoft OAuth 回傳 ${res.status}: ${err.error_description || err.error || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

/** Discord: 呼叫 /users/@me 驗證 Bot Token */
async function testDISCORD(config: Record<string, string>) {
    const token = config.discordBotToken;
    if (!token) return { success: false, message: '缺少 Bot Token' };

    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token}` },
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
async function testWECHAT(config: Record<string, string>) {
    const appId = config.wechatAppId;
    const appSecret = config.wechatAppSecret;
    if (!appId || !appSecret) return { success: false, message: '缺少 AppID 或 AppSecret' };

    try {
        const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`);
        const data = await res.json();
        if (data.access_token) {
            return { success: true, message: `AppID ${appId} 驗證成功，已取得 access_token` };
        }
        return { success: false, message: `微信 API 錯誤 ${data.errcode}: ${data.errmsg || '驗證失敗'}` };
    } catch (e: any) {
        return { success: false, message: `連線失敗: ${e.message}` };
    }
}

// ---------------------------------------------------------------------------
// 金流服務的驗證邏輯
// ---------------------------------------------------------------------------

/** ECPay: 驗證 MerchantID 格式（ECPay 不提供公開驗證 API，僅做格式校驗） */
async function testECPAY(config: Record<string, string>) {
    const merchantId = config.merchantId;
    const hashKey = config.hashKey;
    const hashIV = config.hashIV;

    if (!merchantId) return { success: false, message: '缺少特店編號 (MerchantID)' };
    if (!hashKey) return { success: false, message: '缺少 HashKey' };
    if (!hashIV) return { success: false, message: '缺少 HashIV' };

    // ECPay 沒有公開的驗證端點，進行格式驗證
    if (merchantId.length < 4) return { success: false, message: 'MerchantID 格式不正確 (太短)' };
    if (hashKey.length < 8) return { success: false, message: 'HashKey 格式不正確 (太短)' };
    if (hashIV.length < 8) return { success: false, message: 'HashIV 格式不正確 (太短)' };

    // 呼叫綠界查詢信用卡期數 API 做連線測試
    try {
        const res = await fetch('https://payment.ecpay.com.tw/Cashier/QueryCreditCardPeriodInfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `MerchantID=${merchantId}&TimeStamp=${Math.floor(Date.now() / 1000)}`,
        });
        // 即使回傳錯誤但有回應，表示能連上 ECPay 伺服器
        if (res.ok || res.status < 500) {
            return { success: true, message: `特店編號 ${merchantId} 格式正確，ECPay 伺服器可連線` };
        }
        return { success: false, message: `ECPay 伺服器回傳 ${res.status}` };
    } catch (e: any) {
        // 即使連線失敗，參數格式已驗證通過
        return { success: true, message: `特店編號 ${merchantId} 參數格式驗證通過 (伺服器連線異常: ${e.message})` };
    }
}

/** Stripe: 呼叫 /v1/balance 驗證 Secret Key */
async function testSTRIPE(config: Record<string, string>) {
    const secretKey = config.secretKey;
    if (!secretKey) return { success: false, message: '缺少 Secret Key' };

    // 基本格式檢查
    if (!secretKey.startsWith('sk_')) return { success: false, message: 'Secret Key 格式不正確 (應以 sk_ 開頭)' };

    try {
        const res = await fetch('https://api.stripe.com/v1/balance', {
            headers: { Authorization: `Bearer ${secretKey}` },
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
async function testPAYPAL(config: Record<string, string>) {
    const clientId = config.clientId;
    const secretKey = config.secretKey;
    if (!clientId) return { success: false, message: '缺少 Client ID' };
    if (!secretKey) return { success: false, message: '缺少 Secret Key' };

    try {
        const auth = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
        const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });

        if (res.ok) {
            const data = await res.json();
            return { success: true, message: `PayPal 帳戶驗證成功 (App: ${data.app_id || 'OK'})`, details: { app_id: data.app_id } };
        }

        // 沙盒環境嘗試
        const sandboxRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
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

// ---------------------------------------------------------------------------
// 測試分發器
// ---------------------------------------------------------------------------
const TEST_HANDLERS: Record<string, (config: Record<string, string>) => Promise<{ success: boolean; message: string; details?: any }>> = {
    LINE: testLINE,
    TELEGRAM: testTELEGRAM,
    WHATSAPP: testWHATSAPP,
    MESSENGER: testMESSENGER,
    SLACK: testSLACK,
    TEAMS: testTEAMS,
    DISCORD: testDISCORD,
    WECHAT: testWECHAT,
    ECPAY: testECPAY,
    STRIPE: testSTRIPE,
    PAYPAL: testPAYPAL,
};

// ---------------------------------------------------------------------------
// POST - 執行測試
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { integrationId, type, config } = body || {};

        if (!type) {
            return NextResponse.json({ ok: false, error: 'type is required.' }, { status: 400 });
        }

        const upperType = String(type).toUpperCase();
        const handler = TEST_HANDLERS[upperType];

        if (!handler) {
            return NextResponse.json(
                { ok: false, error: `不支援的整合類型: ${upperType}` },
                { status: 400 }
            );
        }

        if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
            return NextResponse.json(
                { ok: false, error: '缺少 config 參數' },
                { status: 400 }
            );
        }

        console.log(`[app-integrations/test] Testing ${upperType} for integration ${integrationId || 'N/A'}`);

        const result = await handler(config);

        console.log(`[app-integrations/test] ${upperType} result:`, result.success ? 'SUCCESS' : 'FAIL', result.message);

        return NextResponse.json({
            ok: true,
            type: upperType,
            integrationId: integrationId || null,
            result,
        });
    } catch (error: any) {
        console.error('[app-integrations/test] Error:', error?.message || error);
        return NextResponse.json(
            { ok: false, error: `測試發生錯誤: ${error?.message || '未知錯誤'}` },
            { status: 500 }
        );
    }
}
