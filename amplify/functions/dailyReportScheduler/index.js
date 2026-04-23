/**
 * AWS Lambda Function: Three-Tier Report Scheduler
 * 
 * Triggered by Amazon EventBridge with tier-specific input:
 *   - Health check: every 6 hours  → {"tier": "health"}
 *   - Daily news:   00:00 TW daily → {"tier": "daily"}
 *   - Weekly risk:  Mon 00:00 TW   → {"tier": "weekly"}
 * 
 * Calls the Next.js API endpoint with the tier parameter.
 */

const https = require('https');
const http = require('http');

const VALID_TIERS = ['health', 'daily', 'weekly', 'full'];

exports.handler = async (event) => {
    // Extract tier from EventBridge input (defaults to 'full' for manual invocation)
    const tier = (event && event.tier && VALID_TIERS.includes(event.tier)) ? event.tier : 'full';

    console.log(`[ReportScheduler] ${tier} tier triggered at:`, new Date().toISOString());
    console.log('[ReportScheduler] Event:', JSON.stringify(event));

    // The base URL of your Amplify-deployed app
    const baseUrl = process.env.APP_BASE_URL;
    const cronSecret = process.env.CRON_SECRET;

    if (!baseUrl) {
        console.error('[ReportScheduler] APP_BASE_URL not set');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'APP_BASE_URL environment variable not configured' }),
        };
    }

    const url = `${baseUrl}/api/cron/daily-report?tier=${tier}`;
    console.log('[ReportScheduler] Calling:', url);

    try {
        const result = await makeRequest(url, cronSecret, tier);
        console.log('[ReportScheduler] Result:', JSON.stringify(result));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `${tier} report triggered successfully`,
                tier,
                result,
                triggeredAt: new Date().toISOString(),
            }),
        };
    } catch (error) {
        console.error('[ReportScheduler] Error:', error.message);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
                tier,
                triggeredAt: new Date().toISOString(),
            }),
        };
    }
};

function makeRequest(url, cronSecret, tier) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const body = JSON.stringify({ tier });

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...(cronSecret ? { 'Authorization': `Bearer ${cronSecret}` } : {}),
            },
            timeout: 120000, // 2 minutes — report generation takes time
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve({ raw: data, statusCode: res.statusCode });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out after 120 seconds'));
        });

        req.write(body);
        req.end();
    });
}
