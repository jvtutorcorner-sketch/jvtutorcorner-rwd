import crypto from 'crypto';

// ECPay Environment Constants
const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '2000132'; // Test MerchantID
const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9'; // Test HashKey
const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS'; // Test HashIV

// API URLs
export const ECPAY_API_URL = process.env.NODE_ENV === 'production'
    ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

/**
 * Generate ECPay CheckMacValue
 * 
 * Algorithm:
 * 1. Sort parameters alphabetically by key.
 * 2. Prepend HashKey, Append HashIV.
 * 3. URL Encode (special rules).
 * 4. Lowercase.
 * 5. SHA256.
 * 6. Uppercase.
 */
export function generateCheckMacValue(params: Record<string, string | number>): string {
    // 1. Sort parameters
    const keys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // 2. Format string: HashKey=...&param1=value1...&HashIV=...
    let rawString = `HashKey=${ECPAY_HASH_KEY}`;

    keys.forEach(key => {
        // ECPay spec: Ignore 'CheckMacValue' parameter if present in input
        if (key === 'CheckMacValue') return;
        rawString += `&${key}=${params[key]}`;
    });

    rawString += `&HashIV=${ECPAY_HASH_IV}`;

    // 3. URL Encode with special replacements
    // EncodeURIComponent encodes everything, including some chars ECPay wants specific handling for.
    // ECPay .NET/Java examples imply standard URL encoding but manual replacement for:
    // %2d -> -
    // %5f -> _
    // %2e -> .
    // %21 -> !
    // %2a -> *
    // %28 -> (
    // %29 -> )
    // And requires converting to lowercase before hashing.

    let encoded = encodeURIComponent(rawString).toLowerCase();

    // Replacements based on ECPay spec to match their .NET HttpUtility.UrlEncode behavior nuances
    // Actually, standard encodeURIComponent produces uppercase hex (%2F). 
    // We lowercased it above, so we look for %2d etc.

    encoded = encoded
        .replace(/%2d/g, '-')
        .replace(/%5f/g, '_')
        .replace(/%2e/g, '.')
        .replace(/%21/g, '!')
        .replace(/%2a/g, '*')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
        .replace(/%20/g, '+');

    // 4. SHA256
    const sha256 = crypto.createHash('sha256').update(encoded).digest('hex');

    // 5. Uppercase
    return sha256.toUpperCase();
}

/**
 * Verify ECPay CheckMacValue from incoming request
 */
export function verifyCheckMacValue(params: Record<string, string | number>): boolean {
    const receivedCheckMacValue = params['CheckMacValue'] as string;
    if (!receivedCheckMacValue) return false;

    const calculated = generateCheckMacValue(params);
    return calculated === receivedCheckMacValue;
}

/**
 * Helper to generate unique MerchantTradeNo
 */
export function generateMerchantTradeNo(): string {
    // Max 20 chars. 
    // Accessing ECPay usually requires unique ID. 
    // Format: {Timestamp}{Random}
    // Date.now() is 13 chars. Random 4 chars. Total 17.
    return `JV${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Standard ECPay Parameters
 */
export function getBaseEcpayParams() {
    return {
        MerchantID: ECPAY_MERCHANT_ID,
        PaymentType: 'aio',
        EncryptType: 1, // SHA256
    };
}
