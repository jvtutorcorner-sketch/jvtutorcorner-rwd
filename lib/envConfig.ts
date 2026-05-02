/**
 * Centralised Environment Configuration
 * ======================================
 *
 * 單一開關：APP_ENV
 *   local      → 所有金流使用沙盒 / 測試憑證
 *   production → 所有金流使用正式憑證
 *
 * 所有金流 lib (stripe, paypal, linepay, ecpay) 應從此檔引入 URL 與環境判斷。
 * 禁止在各金流 lib 中直接讀取 NODE_ENV，統一從此讀取 APP_ENV。
 */

export type AppEnv = 'local' | 'production';

export const APP_ENV: AppEnv =
  process.env.APP_ENV === 'production' ? 'production' : 'local';

export const IS_PRODUCTION = APP_ENV === 'production';
export const IS_LOCAL = APP_ENV === 'local';

// ─── PayPal ──────────────────────────────────────────────────────────────────
// local      → sandbox
// production → live
export const PAYPAL_API_BASE_URL = IS_PRODUCTION
  ? (process.env.PAYPAL_API_BASE_URL_PROD     || 'https://api-m.paypal.com')
  : (process.env.PAYPAL_API_BASE_URL_SANDBOX  || 'https://api-m.sandbox.paypal.com');

// ─── LINE Pay ────────────────────────────────────────────────────────────────
// local      → sandbox
// production → live
export const LINEPAY_SITE_URL = IS_PRODUCTION
  ? (process.env.LINEPAY_SITE_URL_PROD    || 'https://api-pay.line.me')
  : (process.env.LINEPAY_SITE_URL_SANDBOX || 'https://sandbox-api-pay.line.me');

// ─── ECPay ───────────────────────────────────────────────────────────────────
// local      → staging
// production → live
export const ECPAY_API_URL = IS_PRODUCTION
  ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
  : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

// ─── Runtime Guard (server-side only) ────────────────────────────────────────
// 啟動時若憑證與 APP_ENV 不符，印出警告防止混用。
if (typeof window === 'undefined') {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const paypalBase = IS_PRODUCTION
    ? (process.env.PAYPAL_API_BASE_URL_PROD     || '')
    : (process.env.PAYPAL_API_BASE_URL_SANDBOX  || '');
  const linepayUrl = IS_PRODUCTION
    ? (process.env.LINEPAY_SITE_URL_PROD    || '')
    : (process.env.LINEPAY_SITE_URL_SANDBOX || '');

  if (IS_PRODUCTION) {
    // 正式環境：禁止使用測試憑證
    if (stripeKey && stripeKey.startsWith('sk_test_')) {
      console.error('[EnvConfig] ❌ APP_ENV=production 但 STRIPE_SECRET_KEY 是測試金鑰 (sk_test_*)！請換成 sk_live_* 正式金鑰。');
    }
    if (paypalBase.includes('sandbox')) {
      console.error('[EnvConfig] ❌ APP_ENV=production 但 PAYPAL_API_BASE_URL_PROD 指向 sandbox！');
    }
    if (linepayUrl.includes('sandbox')) {
      console.error('[EnvConfig] ❌ APP_ENV=production 但 LINEPAY_SITE_URL_PROD 指向 sandbox！');
    }
  } else {
    // 本機/測試環境：禁止誤用正式憑證
    if (stripeKey && stripeKey.startsWith('sk_live_')) {
      console.error('[EnvConfig] ❌ APP_ENV=local 但 STRIPE_SECRET_KEY 是正式金鑰 (sk_live_*)！拒絕在非 production 環境使用正式金鑰。');
    }
    if (paypalBase && !paypalBase.includes('sandbox')) {
      console.warn('[EnvConfig] ⚠️  APP_ENV=local 但 PAYPAL_API_BASE_URL_SANDBOX 未指向 sandbox，請確認。');
    }
  }

  console.log(`[EnvConfig] APP_ENV=${APP_ENV} | PayPal=${PAYPAL_API_BASE_URL} | LINE Pay=${LINEPAY_SITE_URL} | ECPay=${IS_PRODUCTION ? 'prod' : 'staging'}`);
}
