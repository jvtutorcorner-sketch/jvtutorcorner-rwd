import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { LINEPAY_SITE_URL as LINEPAY_SITE_URL_FROM_CONFIG } from '@/lib/envConfig';

const LINEPAY_CHANNEL_ID = process.env.LINEPAY_CHANNEL_ID || '';
const LINEPAY_CHANNEL_SECRET_KEY = process.env.LINEPAY_CHANNEL_SECRET_KEY || '';
const LINEPAY_VERSION = process.env.LINEPAY_VERSION || 'v3';
// URL 由 envConfig 根據 APP_ENV 決定（local → sandbox, production → live）
// 仍允許透過 LINEPAY_SITE_URL 環境變數覆蓋（供特殊情境使用）
const LINEPAY_SITE_URL = process.env.LINEPAY_SITE_URL || LINEPAY_SITE_URL_FROM_CONFIG;

/**
 * Generate Line Pay V3 API Signature
 * Signature = Base64(HMAC-SHA256(ChannelSecret, (ChannelSecret + URI + RequestBody + nonce)))
 */
export function generateLinePaySignature(uri: string, requestBody: string, nonce: string): string {
    const stringToSign = `${LINEPAY_CHANNEL_SECRET_KEY}${uri}${requestBody}${nonce}`;
    const hmac = crypto.createHmac('sha256', LINEPAY_CHANNEL_SECRET_KEY);
    hmac.update(stringToSign);
    return hmac.digest('base64');
}

/**
 * Initialize a Line Pay payment request
 */
export async function requestLinePayPayment(payload: any) {
    const uri = `/${LINEPAY_VERSION}/payments/request`;
    const url = `${LINEPAY_SITE_URL}${uri}`;
    const nonce = uuidv4();
    const requestBody = JSON.stringify(payload);
    const signature = generateLinePaySignature(uri, requestBody, nonce);

    const headers = {
        'Content-Type': 'application/json',
        'X-LINE-ChannelId': LINEPAY_CHANNEL_ID,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature,
    };

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: requestBody,
    });

    return await res.json();
}

/**
 * Confirm a Line Pay payment after user approves it
 */
export async function confirmLinePayPayment(transactionId: string, amount: number, currency = 'TWD') {
    const uri = `/${LINEPAY_VERSION}/payments/${transactionId}/confirm`;
    const url = `${LINEPAY_SITE_URL}${uri}`;
    const nonce = uuidv4();
    const payload = {
        amount,
        currency,
    };
    const requestBody = JSON.stringify(payload);
    const signature = generateLinePaySignature(uri, requestBody, nonce);

    const headers = {
        'Content-Type': 'application/json',
        'X-LINE-ChannelId': LINEPAY_CHANNEL_ID,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature,
    };

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: requestBody,
    });

    return await res.json();
}
