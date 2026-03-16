#!/usr/bin/env node
/**
 * Script to initialize AI models via HTTP API
 * Useful when AWS credentials are not configured locally
 * Usage: node scripts/init-ai-models-via-api.mjs [http://localhost:3000]
 */

import http from 'http';

const baseUrl = process.argv[2] || 'http://localhost:3000';

const apiCall = (method, path, body = null) => {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

async function initializeViaAPI() {
    console.log('🤖 AI Models Initialization (via HTTP API)');
    console.log(`📍 Target: ${baseUrl}`);
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log('');

    try {
        console.log('📝 Initializing AI models...');
        const result = await apiCall('POST', '/api/admin/ai-models', {
            action: 'initialize',
        });

        console.log('Response Status:', result.status);
        console.log('Response:', result.data);
        console.log('');

        if (result.status === 200 && result.data.ok) {
            console.log('✅ AI models initialized successfully!');
            console.log('');
            console.log('📖 Next steps:');
            console.log('   1. Verify: curl ' + baseUrl + '/api/admin/ai-models');
            console.log('   2. Check DynamoDB: AWS Console > DynamoDB > Tables > jvtutorcorner-ai-models');
            console.log('');
            process.exit(0);
        } else {
            throw new Error(result.data?.error || `HTTP ${result.status}`);
        }
    } catch (error) {
        console.error('❌ Initialization failed:', error?.message || error);
        console.log('');
        console.log('💡 Troubleshoot:');
        console.log(`   1. Make sure server is running at ${baseUrl}`);
        console.log('   2. Check AWS credentials in environment or IAM role');
        console.log('   3. DynamoDB table "jvtutorcorner-ai-models" must exist');
        console.log('');
        process.exit(1);
    }
}

initializeViaAPI();
