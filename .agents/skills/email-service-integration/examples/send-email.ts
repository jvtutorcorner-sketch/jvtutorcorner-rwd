/**
 * 範例：如何調用郵件發送 API
 */

// 使用環境變數設定基礎 URL，避免硬編碼 localhost
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/workflows/gmail-send`; // 或 resend-send

async function sendTestEmail() {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: 'test@example.com',
                subject: '測試郵件',
                body: '這是一封從腳本發出的測試郵件。',
                html: '<h1>測試郵件</h1><p>這是一封從腳本發出的測試郵件。</p>'
            }),
        });

        const result = await response.json();
        if (result.ok) {
            console.log('郵件發送成功:', result.data.messageId);
        } else {
            console.error('郵件發送失敗:', result.error);
        }
    } catch (error) {
        console.error('API 調用錯誤:', error);
    }
}

sendTestEmail();
