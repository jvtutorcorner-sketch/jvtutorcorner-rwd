# classroom-wait SSE 同步問題修復

## 問題診斷

### 🚨 根本原因
在 production 環境（`https://www.jvtutorcorner.com`），SSE 被完全禁用，返回 503 狀態碼，強制使用 polling 同步策略。但 polling 間隔過長（5 秒），導致多人同時點擊「準備好」時經常失敗。

**時間線例子**：
- T=0s: 學生點「準備好」→ POST `/api/classroom/ready` → 伺服器更新文件
- T=0.1s: 教師點「準備好」→ POST `/api/classroom/ready` → 伺服器更新文件
- T=5s: 學生的 polling 觸發，獲知教師已準備好
- **延遲時間：5 秒** ❌ 用戶感受到嚴重延遲或失敗

### 💥 多人競態條件
即使有 `fileLocks` 保護，5 秒的 polling 延遲也會導致：1. 其他客戶端無法及時獲知狀態變化
2. 多人同時操作時狀態不一致
3. 白板房間無法及時創建或連接

---

## ✅ 短期修復（已實施）

### Commit: `aebf9f5`

#### 1. **增加 Polling 頻率** 
- **之前**：5000ms（5 秒）
- **之後**：1000ms（1 秒）在 production 環境
- **位置**：`app/classroom/wait/page.tsx` 行 ~600

```typescript
// CRITICAL: In production, use 1-second polling for reliable multi-user sync.
const pollingInterval = isProduction ? 1000 : 5000;  // 1s prod, 5s dev
```

#### 2. **減少 Debounce 延遲**
- **之前**：100ms
- **之後**：10ms 在 production 環境
- **位置**：`app/classroom/wait/page.tsx` 行 `syncStateFromServer`

```typescript
const debounceDelay = isProduction ? 10 : 100;  // 10ms prod, 100ms dev
```

### 效果預期
- **同步延遲**：從 5 秒降至 1 秒（改善 **80%**）
- **成功率**：多人同時點擊時失敗率大幅降低
- **伺服器負載**：polling 增加 5 倍，但因 debounce 減少，實際 API 調用增加 ~3 倍

---

## 🔧 長期解決方案（建議實施）

### **選項 A：在 Production 啟用 SSE（推薦）**
目前 SSE 在 production 被禁用的原因：
> *"Serverless 環境中的 in-memory 狀態共享不可靠"*

但如果使用：
- **Redis** 作為全局消息佇列，或
- **DynamoDB Streams** 作為事件推送，或
- **Pub/Sub 系統**（Google Cloud Pub/Sub、AWS SNS/SQS）

就可以安全地在 serverless 中啟用 SSE。

**改進步驟**：
1. 採用 Redis 或 DynamoDB Streams
2. 修改 `/api/classroom/stream/route.ts` 移除 production 環境檢查
3. 使用共享 state store 替代內存中的 `clients` 映射

### **選項 B：改用 WebSocket**
如果已有 WebSocket 基礎設施，WebSocket 天生支持雙向通信，比 SSE 更可靠。

### **選項 C：增加 Polling 頻率至 500ms**
如果不想投入 SSE/WebSocket，可進一步增加 polling 頻率：
```typescript
const pollingInterval = isProduction ? 500 : 5000;  // 500ms prod
```
但這會增加伺服器負載，不推薦。

---

## 📊 驗證方法

### 快速測試（本地開發環境）
```bash
# 終端 1：啟動開發伺服器
npm run dev

# 終端 2：以教師身份運行測試
TEST_TEACHER_EMAIL=lin@test.com TEST_TEACHER_PASSWORD=123456 npx playwright test e2e/classroom_wait_sync.spec.ts

# 終端 3：同時以學生身份運行（模擬多人）
TEST_STUDENT_EMAIL=pro@test.com TEST_STUDENT_PASSWORD=123456 npx playwright test e2e/classroom_wait_sync.spec.ts
```

### Production 驗證（使用 https://www.jvtutorcorner.com）
```bash
NEXT_PUBLIC_BASE_URL='https://www.jvtutorcorner.com' npx playwright test e2e/classroom_room_whiteboard_sync.spec.ts --project=chromium
```

---

## 📋 相關文件

- `/app/classroom/wait/page.tsx` - 等候室頁面（polling/SSE 邏輯）
- `/app/api/classroom/stream/route.ts` - SSE 端點（production 禁用邏輯）
- `/app/api/classroom/ready/route.ts` - 準備狀態 API（fileLocks 實現）
- `.agents/skills/classroom-wait/SKILL.md` - 測試指南與環境檢查

---

## 🎯 監控指標

部署後請追蹤：
- **錯誤率**：`/api/classroom/ready` POST 失敗率
- **延遲**：從點擊「準備好」至另一端看到狀態變化的時間
- **成功率**：多人同時進入教室的成功次數
- **伺服器負載**：polling 增加的 CPU/記憶體/API 調用量

---

## 🚀 部署建議

1. **立即部署**：這次的 1s polling + 10ms debounce
2. **監控 1-2 週**：收集效果數據
3. **評估**：如果仍有 >10% 失敗率，考慮長期方案（Redis/WebSocket）
4. **優化**：根據監控數據調整数字（可能粗調至 500ms 或 200ms）

---

## ❓ FAQ

### Q: 為什麼生產環境的 polling 還是會失敗？
A: 1 秒的延遲仍然可能導致使用者感知的不同步。長期需要 SSE（需 state store）或 WebSocket。

### Q: 這樣伺服器負載會增加多少？
A: 假設 100 個活躍教室，polling 間隔 1s，每次 ~1ms 的 debounce，實際伺服器負載增加約 3-5 倍。但因部署在 Amplify/serverless，應可自動擴展。

### Q: 可以同時啟用 SSE 和 polling 嗎？
A: 可以。已有代碼支持這一點：若 SSE 失敗，自動降級到 polling。長期 SSE 應該是首選。

### Q: 能否使用 `setInterval` 而非 `setTimeout` debounce？
A: 不行。Debounce 需要清除前一個待處理的請求，`setInterval` 無法做到。

---

**最初修復日期**：2026-04-11  
**Commit**：aebf9f5  
**影響範圍**：production 環境的等候室同步（SSE 不可用的場景）
