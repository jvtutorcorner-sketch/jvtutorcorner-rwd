# LINE Pay 正式環境資料查詢指南

## 🔑 環境設定

### 正式環境 vs 沙箱環境

```
沙箱環境（開發/測試用）:
├─ API URL: https://sandbox-api-pay.line.me
├─ 用途: 開發、功能測試、模擬支付
└─ 當前設置: .env.local 中 LINEPAY_SITE_URL=https://sandbox-api-pay.line.me

正式環境（生產用）:
├─ API URL: https://api-pay.line.me
├─ 用途: 真實交易
└─ 需要更改: .env.local 中 LINEPAY_SITE_URL=https://api-pay.line.me
```

### 查看當前環境設置

```bash
# 查看 .env.local 中的 LINE Pay 配置
grep -i "linepay" .env.local

# 輸出範例:
# LINEPAY_CHANNEL_ID=2000132
# LINEPAY_CHANNEL_SECRET_KEY=xxx
# LINEPAY_VERSION=v3
# LINEPAY_SITE_URL=https://sandbox-api-pay.line.me 或 https://api-pay.line.me
```

---

## 📊 查詢 LINE Pay 交易的 3 種方法

### 方法 1: 透過管理後台（推薦）

#### 📱 LINE Pay 官方管理後台
```
1. 訪問: https://manager.line.biz/
2. 使用商戶帳號登入
3. 進入「決済」或「Payment」
4. 查看交易明細
   ├─ 交易 ID
   ├─ 支付金額
   ├─ 支付時間
   ├─ 狀態 (成功/失敗/待確認)
   └─ 客戶資訊
```

#### 🏢 本地應用管理儀表板
```
訪問: http://localhost:3000/admin/payments
- 查看所有 LINE Pay 交易
- 篩選支付方式: LINE Pay
- 查看訂單詳情
- 導出 CSV 報告
```

---

### 方法 2: 透過 LINE Pay API 查詢交易

#### A. 查詢單筆交易詳情

```typescript
// 查詢特定交易ID的詳情
// API: GET /v3/payments/{transactionId}

import crypto from 'crypto';

const LINEPAY_CHANNEL_ID = 'YOUR_CHANNEL_ID';
const LINEPAY_CHANNEL_SECRET_KEY = 'YOUR_SECRET_KEY';
const LINEPAY_VERSION = 'v3';
const LINEPAY_SITE_URL = 'https://api-pay.line.me'; // 正式環境

function generateLinePaySignature(uri, requestBody, nonce) {
    const stringToSign = `${LINEPAY_CHANNEL_SECRET_KEY}${uri}${requestBody}${nonce}`;
    const hmac = crypto.createHmac('sha256', LINEPAY_CHANNEL_SECRET_KEY);
    hmac.update(stringToSign);
    return hmac.digest('base64');
}

async function queryLinePayTransaction(transactionId) {
    const uri = `/${LINEPAY_VERSION}/payments/${transactionId}`;
    const url = `${LINEPAY_SITE_URL}${uri}`;
    const nonce = require('crypto').randomUUID();
    const requestBody = ''; // GET 請求無 body
    
    const signature = generateLinePaySignature(uri, requestBody, nonce);
    
    const headers = {
        'X-LINE-ChannelId': LINEPAY_CHANNEL_ID,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature,
        'Content-Type': 'application/json',
    };

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers,
        });

        const data = await response.json();
        
        if (data.body) {
            console.log('✅ 交易查詢成功:');
            console.log('交易ID:', data.body.transactionId);
            console.log('狀態:', data.body.status); // 例: COMPLETED
            console.log('金額:', data.body.payInfo[0].amount);
            console.log('支付時間:', data.body.payInfo[0].transactionDate);
            console.log('訂單ID:', data.body.orderId);
        } else {
            console.log('❌ 交易不存在或查詢失敗');
        }
        
        return data;
    } catch (error) {
        console.error('❌ 查詢失敗:', error);
    }
}

// 使用範例
// await queryLinePayTransaction('2024042512345678');
```

#### B. 查詢交易列表（分頁）

```bash
# 使用 curl 查詢交易列表（可選：分頁、日期篩選）
curl -X GET "https://api-pay.line.me/v3/payments" \
  -H "X-LINE-ChannelId: YOUR_CHANNEL_ID" \
  -H "X-LINE-Authorization-Nonce: $(uuidgen)" \
  -H "X-LINE-Authorization: $(base64 -w0 <<< 'signature_here')" \
  -H "Content-Type: application/json"

# 查詢參數:
# ?offset=0&limit=100&startDate=2026-04-01&endDate=2026-04-30&status=COMPLETED
```

---

### 方法 3: 透過本地 API 端點查詢

#### 建立查詢端點

```typescript
// app/api/admin/linepay-transactions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const LINEPAY_CHANNEL_ID = process.env.LINEPAY_CHANNEL_ID || '';
const LINEPAY_CHANNEL_SECRET_KEY = process.env.LINEPAY_CHANNEL_SECRET_KEY || '';
const LINEPAY_SITE_URL = process.env.LINEPAY_SITE_URL || 'https://api-pay.line.me'; // 正式環境

function generateLinePaySignature(uri: string, requestBody: string, nonce: string): string {
    const stringToSign = `${LINEPAY_CHANNEL_SECRET_KEY}${uri}${requestBody}${nonce}`;
    const hmac = crypto.createHmac('sha256', LINEPAY_CHANNEL_SECRET_KEY);
    hmac.update(stringToSign);
    return hmac.digest('base64');
}

// GET /api/admin/linepay-transactions?transactionId=xxx
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const transactionId = searchParams.get('transactionId');

        if (!transactionId) {
            return NextResponse.json(
                { error: 'transactionId required' },
                { status: 400 }
            );
        }

        const uri = `/v3/payments/${transactionId}`;
        const url = `${LINEPAY_SITE_URL}${uri}`;
        const nonce = require('crypto').randomUUID();
        const requestBody = '';

        const signature = generateLinePaySignature(uri, requestBody, nonce);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-LINE-ChannelId': LINEPAY_CHANNEL_ID,
                'X-LINE-Authorization-Nonce': nonce,
                'X-LINE-Authorization': signature,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        return NextResponse.json({
            ok: data.returnCode === '0000',
            data: data.body,
            error: data.returnMessage,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
```

#### 使用端點

```bash
# 本地查詢
curl "http://localhost:3000/api/admin/linepay-transactions?transactionId=2024042512345678"

# 返回範例:
# {
#   "ok": true,
#   "data": {
#     "transactionId": "2024042512345678",
#     "status": "COMPLETED",
#     "payInfo": [
#       {
#         "method": "CREDIT_CARD",
#         "amount": 999,
#         "transactionDate": "2026-04-25 14:30:00",
#         "approvalCode": "123456789"
#       }
#     ],
#     "orderId": "order-123456"
#   }
# }
```

---

## 🔄 切換到正式環境

### Step 1: 更新環境變數

```bash
# .env.local 修改:

# 從沙箱環境切換到正式環境
LINEPAY_SITE_URL=https://api-pay.line.me

# 確保使用正式環境的商戶 ID 和密鑰
# （需要從 LINE Pay 官方獲取）
LINEPAY_CHANNEL_ID=YOUR_PRODUCTION_CHANNEL_ID
LINEPAY_CHANNEL_SECRET_KEY=YOUR_PRODUCTION_SECRET_KEY
```

### Step 2: 重啟應用

```bash
npm run dev
```

### Step 3: 驗證連接

```bash
# 測試支付流程或查詢
curl "http://localhost:3000/api/admin/linepay-transactions?transactionId=xxx"
```

---

## 📋 LINE Pay API 交易查詢 Response 範例

```json
{
  "returnCode": "0000",
  "returnMessage": "Success",
  "info": null,
  "body": {
    "transactionId": 2024042512345678,
    "orderId": "order-abc123",
    "payInfo": [
      {
        "method": "CREDIT_CARD",
        "amount": 999,
        "currency": "TWD",
        "transactionDate": "2026-04-25T06:30:00Z",
        "approvalCode": "987654321",
        "paymentUrl": "https://pay.line.me/payment/..."
      }
    ],
    "status": "COMPLETED",
    "info": {
      "orderId": "order-abc123",
      "amount": 999,
      "currency": "TWD",
      "approvalCode": "987654321"
    }
  }
}
```

### Response 欄位說明

| 欄位 | 說明 | 值範例 |
|-----|------|--------|
| `transactionId` | LINE Pay 交易 ID | 2024042512345678 |
| `orderId` | 商戶訂單 ID | order-abc123 |
| `status` | 交易狀態 | COMPLETED / VOIDED / REFUNDED |
| `method` | 支付方法 | CREDIT_CARD / BALANCE / LINECREDIT |
| `amount` | 支付金額 | 999 |
| `transactionDate` | 支付時間 | 2026-04-25T06:30:00Z |
| `approvalCode` | 授權碼 | 987654321 |

---

## ✅ 常見查詢場景

### 查詢支付成功的交易

```bash
# 透過本地應用查詢
http://localhost:3000/admin/payments?status=PAID&paymentMethod=LINE%20Pay

# 或透過 API
curl "http://localhost:3000/api/admin/linepay-transactions?transactionId=xxx"
```

### 查詢特定日期範圍的交易

```bash
# 透過管理後台
https://localhost:3000/admin/payments?dateFrom=2026-04-01&dateTo=2026-04-30&paymentMethod=LINE%20Pay

# 透過 LINE Pay API（需要添加參數支援）
# startDate=2026-04-01&endDate=2026-04-30
```

### 查詢特定用戶的交易

```bash
# 透過應用
http://localhost:3000/admin/payments?userId=pro@test.com&paymentMethod=LINE%20Pay

# 或直接查詢 DynamoDB
aws dynamodb query \
  --table-name jvtutorcorner-orders \
  --index-name userId-createdAt-index \
  --key-condition-expression "userId = :userId AND createdAt > :date" \
  --expression-attribute-values "{\":userId\": {\"S\": \"pro@test.com\"}, \":date\": {\"S\": \"2026-04-01\"}}"
```

---

## 🔐 安全建議

### 正式環境注意事項

```
✅ DO:
├─ 使用環境變數存儲敏感資訊
├─ 定期審計交易記錄
├─ 使用 HTTPS
├─ 實施日誌記錄和監控
└─ 定期備份交易資料

❌ DON'T:
├─ 將商戶 ID/密鑰硬編碼
├─ 在日誌中記錄敏感資訊
├─ 使用 HTTP（必須 HTTPS）
├─ 過度暴露 API
└─ 缺少身份驗證
```

---

## 🛠️ 故障排除

### 查詢失敗的常見原因

| 問題 | 原因 | 解決方案 |
|-----|------|--------|
| 401 Unauthorized | 簽名錯誤 | 檢查 HMAC-SHA256 計算 |
| 404 Not Found | 交易 ID 不存在 | 驗證交易 ID 是否正確 |
| 500 Server Error | LINE Pay API 故障 | 重試或檢查 LINE Pay 狀態 |
| Timeout | 網路連接問題 | 檢查防火牆和網路配置 |
| 環境混淆 | 使用錯誤的環境 URL | 確認 LINEPAY_SITE_URL 正確 |

### 除錯技巧

```typescript
// 啟用詳細日誌
console.log('[LINE Pay] 正式環境 URL:', LINEPAY_SITE_URL);
console.log('[LINE Pay] Channel ID:', LINEPAY_CHANNEL_ID);
console.log('[LINE Pay] Nonce:', nonce);
console.log('[LINE Pay] Signature:', signature);
console.log('[LINE Pay] Request:', {
    url,
    method: 'GET',
    headers: {
        'X-LINE-ChannelId': LINEPAY_CHANNEL_ID,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature,
    },
});
```

---

## 📚 相關資源

- [LINE Pay API 官方文檔](https://pay.line.me/web/payment/doc/api-reference)
- [LINE Pay 管理後台](https://manager.line.biz/)
- [本地應用管理儀表板](http://localhost:3000/admin/payments)
- [LINE Pay 沙箱環境](https://sandbox-api-pay.line.me)

---

## 📝 快速參考

```bash
# 切換到正式環境
sed -i "s|LINEPAY_SITE_URL=https://sandbox-api-pay.line.me|LINEPAY_SITE_URL=https://api-pay.line.me|" .env.local

# 驗證切換
grep LINEPAY_SITE_URL .env.local

# 查詢交易
curl "http://localhost:3000/api/admin/linepay-transactions?transactionId=YOUR_TX_ID"

# 檢查管理儀表板
# 訪問: http://localhost:3000/admin/payments
```
