import { NextResponse } from 'next/server';
import { PAYPAL_API_BASE_URL } from '@/lib/envConfig';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_APP_SECRET = process.env.PAYPAL_APP_SECRET;
// URL 由 envConfig 根據 APP_ENV 決定（local → sandbox, production → live）
const PAYPAL_API_BASE = PAYPAL_API_BASE_URL;

/**
 * Generate PayPal Access Token using OAuth 2.0 Client Credentials Flow
 */
export async function generateAccessToken() {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_APP_SECRET) {
        throw new Error('MISSING_API_CREDENTIALS');
    }

    const auth = Buffer.from(
        `${PAYPAL_CLIENT_ID}:${PAYPAL_APP_SECRET}`
    ).toString('base64');

    const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        body: 'grant_type=client_credentials',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    const data = await response.json();
    return data.access_token;
}

export const PAYPAL_API = {
    base: PAYPAL_API_BASE,
};

/** 目前使用中的 PayPal API Base URL（用於 log/debug） */
export const ACTIVE_PAYPAL_ENV = PAYPAL_API_BASE;
