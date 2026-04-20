/**
 * AWS Amplify Lambda Function 範例: 郵件排程器 (Generic Email Scheduler)
 * 
 * 此 Lambda 函數應透過 `amplify add function` 建立，並設定為定期觸發。
 * 它會定期呼叫 Next.js 的 API 路由來掃描資料庫並發送郵件。
 */

const https = require('https');

exports.handler = async (event) => {
    // 1. 從環境變數讀取配置 (需在 Amplify Console 的 Lambda 函數配置中設定，或透過 Team Provider 注入)
    const APP_URL = process.env.APP_BASE_URL; // 例如: https://main.xxxx.amplifyapp.com
    const CRON_SECRET = process.env.CRON_SECRET;

    if (!APP_URL) {
        throw new Error('APP_BASE_URL is not configured');
    }

    // 2. 指定要觸發的 Next.js API 路由 (例如課程提醒)
    const url = `${APP_URL}/api/cron/process-reminders`;

    console.log(`[Scheduler] Triggering email scan at: ${url}`);

    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CRON_SECRET}`
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log(`[Scheduler] Response: ${res.statusCode} - ${body}`);
                resolve({ statusCode: res.statusCode, body });
            });
        });

        req.on('error', (e) => {
            console.error(`[Scheduler] Request error: ${e.message}`);
            reject(e);
        });

        req.end();
    });
};
