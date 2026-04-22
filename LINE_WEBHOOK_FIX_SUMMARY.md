# LINE 藥品辨識結果回復修復總結

## 問題背景
用戶在 LINE 接收藥品辨識結果時，出現**不完整的 JSON 響應**，導致無法解析結果。

### 原因
在 [route.ts](app/api/line/webhook/[integrationId]/route.ts) 中，當 AI 服務返回 `analysisResult.raw` 時（非標準 JSON 格式的回應），代碼存在多層截斷：

1. **第一次截斷**：`rawText.slice(0, 2000)` — 直接在 2000 字符處切斷
2. **第二次截斷**：後續的 `responseText.substring(0, 4500)` — LINE 5000 字符限制
3. **結果**：JSON 在中間被截斷，導致無法解析且用戶看到不完整的回應

```typescript
// ❌ OLD CODE - 存在問題
let annotated = rawText.slice(0, 2000); // 直接截斷！
const msg = { type: 'text', text: responseText.substring(0, 4500) }; // 再次截斷
```

---

## 修復方案 ✅

### 改進架構
新的邏輯按照 LINE 的消息限制更智能地處理回應：

1. **多消息支持** — 如果結果過長，分成多條消息發送
2. **行級截斷** — 按行而不是字符截斷，保持 JSON 完整性
3. **智能格式化** — 嘗試解析 JSON，如果成功則格式化顯示
4. **清晰標記** — 告訴用戶是否是分部分回應

### 核心改進

#### 1️⃣ 完整 JSON 解析與格式化
```typescript
try {
    const parsed = JSON.parse(rawText);
    formattedRaw = JSON.stringify(parsed, null, 2); // 格式化
} catch (e) {
    formattedRaw = rawText; // 不是 JSON，保持原樣
}
```

#### 2️⃣ 按行級別分割（保持完整性）
```typescript
const lines = formattedRaw.split('\n');
for (const line of lines) {
    if ((currentChunk + line + '\n').length <= 4500) {
        currentChunk += line + '\n'; // 添加整行
    } else {
        rawChunks.push(currentChunk); // 當前塊滿了，開始新的
        currentChunk = line + '\n';
    }
}
```

#### 3️⃣ 分消息發送
```typescript
// 成功消息
messages.push({ type: 'text', text: responseText });

// 詳細回應（可能多條）
rawChunks.forEach((chunk, idx) => {
    messages.push({
        type: 'text',
        text: `📄 詳細回應 (${idx + 1}/${rawChunks.length}):\n\n\`\`\`\n${chunk}\n\`\`\``
    });
});
```

---

## 用戶體驗改進

### 之前 ❌
```
📸 藥品辨識結果：

抱歉，我們無法以標準格式解析此張照片的結果...

原始回應（供技術團隊調查）：
{
  "shape": "圓形",
  "color": "白",
  "imprint": "無",
  

訊息 ID: 607139340137005381
```
**問題**：JSON 被截斷在 `"imprint": "無",` 之後，無法使用

### 之後 ✅
```
第一條消息：
📸 藥品辨識結果：

抱歉，我們無法以標準格式解析此張照片的結果。
請先嘗試下列步驟，再重新上傳：
1) 拍攝清晰、光線充足的照片...

📋 訊息 ID: 607139340137005381
⏰ 時間: 2026-03-29T...

第二條消息（如需要）：
📄 詳細回應 (1/1):

\`\`\`
{
  "shape": "圓形",
  "color": "白",
  "imprint": "無",
  "score_line": "無"
}
\`\`\`
```
**優勢**：
- ✅ 完整的 JSON 回應
- ✅ 清晰的錯誤說明
- ✅ 便於技術團隊調查
- ✅ 用戶體驗更好

---

## 技術細節

### 複雜場景支持
- **短回應**：單條消息
- **長回應**：自動分成多條（帶序號如 "1/3", "2/3", "3/3"）
- **特大回應**：最終保護機制，防止任何消息超過 4500 字符

### 集成現有系統
- 保留原有的 `logToWebhook()` 系統記錄完整日誌
- 保留 `analysisResult.raw` 的處理邏輯
- 相容所有 AI 提供商（Gemini, OpenAI, Anthropic）
- 保留模擬模式 (`isSimulation`) 的支持

---

## 測試建議

### 測試場景
1. **標準成功** — 檢查正常的 JSON 格式回應
2. **特大回應** — 測試多消息分割邏輯
3. **格式化** — 驗證 JSON 被正確縮進
4. **錯誤處理** — 確保非 JSON 回應也能優雅顯示

### 驗證
```bash
npm run build  # ✅ 已通過
```

---

## 文件變更
- **修改**: [app/api/line/webhook/[integrationId]/route.ts](app/api/line/webhook/[integrationId]/route.ts)
- **行數**: 約 800-900 行（圖片分析結果處理部分）
- **改變**: 完全重寫 raw response 處理邏輯
