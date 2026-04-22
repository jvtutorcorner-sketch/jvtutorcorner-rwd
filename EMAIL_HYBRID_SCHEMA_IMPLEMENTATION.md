# Email Verification Hybrid Schema Implementation

## 📋 概述

本文檔說明 JV Tutor Corner 郵件驗證的 **混合方案** 實現，結合：
- **基礎層**：在 `profiles` 表記錄驗證狀態（快速查詢）
- **審計層**：在 `jvtutorcorner-email-verification-logs` 表記錄詳細事件（完整追蹤）

## 🏗️ 系統架構

```
┌─────────────────────────────────────────────────────────────────┐
│                    Email Verification Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User Registration                                           │
│     └─> initializeVerificationStatus()                         │
│         ├─> Update profiles table                              │
│         │   ├─ emailVerified: false                            │
│         │   ├─ emailVerificationStatus: 'pending'              │
│         │   ├─ emailVerificationAttempts: 1                    │
│         │   └─ verificationToken, verificationExpires          │
│         └─> Log SENT event                                     │
│             └─> logs table: { eventType: 'SENT', ... }         │
│                                                                 │
│  2. User Clicks Verification Link                              │
│     └─> GET /api/auth/verify-email?token=...&email=...       │
│         ├─> Validate token & expiry                           │
│         ├─> updateEmailVerificationStatus()                    │
│         │   ├─> Update profiles table                          │
│         │   │   ├─ emailVerified: true                         │
│         │   │   ├─ emailVerificationStatus: 'verified'         │
│         │   │   ├─ emailVerificationSuccessAt: now             │
│         │   │   └─ emailVerificationAttempts: +1               │
│         │   └─> Log VERIFIED event                             │
│         │       └─> logs table: { eventType: 'VERIFIED', ... } │
│         └─> clearVerificationToken()                           │
│             └─> Remove verificationToken & verificationExpires │
│                                                                 │
│  3. Admin Queries Verification Status                          │
│     └─> GET /api/admin/email-verification/status?userId=... │
│         └─> Combine profiles + logs data                       │
│             └─> Return VerificationStatusView                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 數據結構

### Profiles 表（基礎層）

```typescript
{
  id: "u_1234",
  email: "user@example.com",
  
  // ─── 驗證狀態 ───
  emailVerified: true,                          // 是否驗證
  emailVerificationStatus: "verified",          // 狀態：pending|verified|failed|resend_requested
  
  // ─── 時間信息 ───
  emailVerificationAttempts: 3,                 // 驗證嘗試次數
  emailVerificationLastAttempt: "2026-04-23T...", // 最後嘗試時間
  emailVerificationSuccessAt: "2026-04-23T...",   // 成功驗證時間
  
  // ─── Token 信息 ───
  verificationToken: "abc123def456...",         // 當前 token
  verificationExpires: "2026-04-24T09:20:15Z",  // Token 過期時間
  
  // ─── 重新發送信息 ───
  emailVerificationResendCount: 2,              // 重新發送次數
  emailVerificationLastResendAt: "2026-04-23T09:25:00Z"  // 最後重新發送時間
}
```

### Email Verification Logs 表（審計層）

```typescript
{
  id: "evlog_u_1234_1682241615000",     // 分區鍵
  userId: "u_1234",                      // GSI：用戶ID
  email: "user@example.com",             // GSI：郵件地址
  
  // ─── 事件信息 ───
  timestamp: "2026-04-23T10:20:15Z",
  eventType: "VERIFIED",                 // SENT|CLICKED|VERIFIED|FAILED|RESENT|EXPIRED|THROTTLED
  status: "success",                     // success|failure
  
  // ─── Token 信息 ───
  tokenHash: "sha256_hash...",           // Token hash（不儲存明文）
  tokenCreatedAt: "2026-04-23T09:20:15Z",
  tokenExpiresAt: "2026-04-24T09:20:15Z",
  
  // ─── 環境信息 ───
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  
  // ─── 結果信息 ───
  errorCode: "TOKEN_EXPIRED",            // 失敗時的錯誤代碼
  errorMessage: "Token expired at...",
  
  // ─── 性能指標 ───
  duration: 125,                         // 從發送到驗證的秒數
  attempt: 3,                            // 驗證嘗試次數
  
  // ─── TTL ───
  ttl: 1714953615                        // 90天後自動刪除
}
```

## 🔧 核心服務

### 1. Email Verification Log Service
**檔案**: `lib/email/emailVerificationLog.ts`

```typescript
// 記錄事件
await logEmailVerificationEvent(userId, email, 'VERIFIED', {
  status: 'success',
  duration: 125,
  ipAddress: '192.168.1.1'
});

// 查詢統計
const stats = await getVerificationStats(userId);
// { totalAttempts: 3, successCount: 1, failureCount: 2, ... }

// 查詢事件
const events = await getVerificationEventsByUserId(userId);
```

### 2. Email Verification Status Service
**檔案**: `lib/email/emailVerificationStatus.ts`

```typescript
// 初始化（註冊時）
await initializeVerificationStatus(userId, email, token, tokenExpires);

// 更新狀態（驗證時）
await updateEmailVerificationStatus(
  userId, email, 'VERIFIED',
  { emailVerified: true, emailVerificationStatus: 'verified' },
  { duration: 125, ipAddress: '192.168.1.1' }
);

// 清理 Token
await clearVerificationToken(userId);
```

### 3. Email Verification Query Service
**檔案**: `lib/email/emailVerificationQuery.ts`

```typescript
// 獲取完整狀態視圖（混合數據）
const view = await getEmailVerificationStatus(userId);
// {
//   userId, email, verified, status,
//   createdAt, firstAttemptAt, lastAttemptAt, successAt,
//   totalAttempts, resendCount,
//   recentEvents: [...]
// }

// 獲取統計摘要
const summary = await getVerificationSummary();
// { verified: 100, pending: 50, failed: 10, total: 160 }

// 查詢待驗證帳號
const pending = await getPendingVerifications(100);
```

## 🔌 API 端點

### 用戶端點

| 端點 | 方法 | 功能 |
|------|------|------|
| `/api/auth/verify-email` | GET | 驗證郵件（點擊驗證鏈接） |
| `/api/auth/resend-verification` | POST | 重新發送驗證信 |
| `/auth/verify-email` | GET | 顯示驗證結果頁面 |

### 管理員端點

```bash
# 查詢特定用戶驗證狀態（包含混合數據）
GET /api/admin/email-verification/status?userId=u_1234
Authorization: Bearer {ADMIN_API_SECRET}

# 獲取統計摘要
GET /api/admin/email-verification/summary
Authorization: Bearer {ADMIN_API_SECRET}

# 列出待驗證帳號
GET /api/admin/email-verification/pending?limit=100
Authorization: Bearer {ADMIN_API_SECRET}

# 列出已過期 Token
GET /api/admin/email-verification/expired?limit=100
Authorization: Bearer {ADMIN_API_SECRET}
```

## ⚙️ 防濫用機制

### 重新發送冷卻（Resend Cooldown）
- **冷卻時間**：5分鐘
- **實現**：檢查 `emailVerificationLastResendAt`
- **響應**：429 Too Many Requests + `retryAfter` 秒數

### 重新發送次數限制
- **上限**：5次
- **實現**：檢查 `emailVerificationResendCount`
- **超限後**：返回錯誤並提示聯繫支援

### Token 過期
- **有效期**：24小時
- **檢查**：比較 `verificationExpires` 和當前時間
- **過期事件**：記錄 'EXPIRED' 事件到日誌表

## 📈 查詢示例

### 查詢用戶驗證進度

```javascript
// 前端
const response = await fetch('/api/admin/email-verification/status?userId=u_1234', {
  headers: { 'Authorization': 'Bearer admin-secret' }
});

const view = await response.json();
console.log(view.data);
// {
//   userId: "u_1234",
//   email: "user@example.com",
//   verified: true,
//   status: "verified",
//   lastAttemptAt: "2026-04-23T10:20:15Z",
//   successAt: "2026-04-23T10:20:15Z",
//   totalAttempts: 2,
//   resendCount: 1,
//   recentEvents: [
//     { timestamp: "2026-04-23T10:20:15Z", eventType: "VERIFIED", status: "success" },
//     { timestamp: "2026-04-23T09:25:00Z", eventType: "RESENT", status: "success" }
//   ]
// }
```

### 獲取驗證統計

```javascript
const response = await fetch('/api/admin/email-verification/summary', {
  headers: { 'Authorization': 'Bearer admin-secret' }
});

const summary = await response.json();
// {
//   success: true,
//   data: {
//     verified: 450,
//     pending: 85,
//     failed: 12,
//     total: 547
//   }
// }
```

## 🧪 測試

### E2E 測試檔案
**檔案**: `e2e/email_hybrid_schema.spec.ts`

測試覆蓋：
- ✅ 註冊時初始化驗證狀態
- ✅ 詳細事件記錄到日誌表
- ✅ 防濫用冷卻機制
- ✅ 重新發送次數限制
- ✅ 驗證成功時更新狀態
- ✅ 驗證統計端點
- ✅ 待驗證列表查詢
- ✅ 已過期 Token 列表

**運行測試**：
```bash
npm run test e2e/email_hybrid_schema.spec.ts
```

## 🔒 安全考量

### 1. Token 安全
- ✅ Token 在日誌表中以 SHA256 hash 儲存（不儲存明文）
- ✅ Token 驗證後立即清除
- ✅ 24小時過期自動清理

### 2. 速率限制
- ✅ 5分鐘冷卻防止短期濫用
- ✅ 5次上限防止長期濫用
- ✅ 返回 429 狀態和重試時間

### 3. 審計追蹤
- ✅ 記錄 IP 地址和 User Agent
- ✅ 記錄所有驗證嘗試（成功/失敗）
- ✅ 90天 TTL 自動清理

### 4. 錯誤信息
- ✅ 成功消息具體：「此郵件地址已驗證」
- ✅ 失敗消息模糊：「如果該郵件地址已註冊...」（防止帳戶列舉）

## 📝 遷移指南

### 從舊方案升級

如果之前使用簡單方案（只有 `emailVerified` 布爾值），需要：

1. **添加新欄位到 profiles 表**：
   ```bash
   # DynamoDB 中執行 Scan + Update
   # 為所有現有 items 初始化新欄位
   ```

2. **創建日誌表**：
   ```bash
   # 建立 jvtutorcorner-email-verification-logs 表
   # 配置 TTL：ttl 欄位
   ```

3. **更新應用程式代碼**：
   ```bash
   # 使用新的服務：emailVerificationStatus, emailVerificationLog
   ```

## 🚀 性能優化

### 查詢優化
- **profiles 表**：使用 GetCommand（PK 查詢，O(1)）
- **logs 表**：使用 ScanCommand with FilterExpression（後續考慮 GSI）
- **統計查詢**：使用 Select: 'COUNT' 減少數據傳輸

### 成本優化
- **日誌 TTL**：90天自動刪除，減少存儲成本
- **批量操作**：考慮使用 BatchGetCommand 查詢多用戶

### 將來改進
- [ ] 為 logs 表添加 GSI（userId, email）支援更快查詢
- [ ] 實現日誌分檔（按月份分檔日誌表）
- [ ] 建立驗證統計 CloudWatch Dashboard

---

**版本**：1.0  
**最後更新**：2026-04-23  
**維護者**：Email Services Team
