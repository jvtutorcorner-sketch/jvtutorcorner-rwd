---
name: student-courses-page
description: '檢查 /student_courses 頁面的按鈕顯示、時間驗證、資料完整性和課程 ID 對應邏輯。'
argument-hint: '測試並驗證 /student_courses 頁面的所有功能'
---

# 學生課程頁面檢查技能 (Student Courses Page Verification)

此技能用於驗證 `/student_courses` 頁面的核心功能，確保進入教室按鈕、時間欄位和課程資料的正確性。

## 功能檢查清單

### 1. 進入教室按鈕時間驗證
- **架構背景**：此功能依賴於 [Core Entities](../../../architecture_overview.md#1-core-entities--database-models) 中的 Course 與 Enrollment 狀態。
- **要求**：「進入教室」按鈕只在「開始時間到結束時間區間內」的課程才顯示
- **驗證方式**：
  - 檢查當前系統時間是否在 `startTime` 和 `endTime` 之間
  - 若時間不在區間內，按鈕應隱藏（顯示 '-'）
  - 若時間在區間內且用戶有有效訂閱，按鈕應顯示
- **相關代碼位置**：`/app/student_courses/page.tsx` - 「進入教室」列的渲染邏輯
- **測試案例**：
  1. 時間在區間內：按鈕應顯示為可點擊的連結
  2. 時間在區間外：按鈕應顯示 '-'
  3. 時間剛好是開始時間或結束時間：按鈕應顯示

### 2. 老師欄位資料檢查
- **要求**：若老師欄位顯示為 '-'，需檢查課程資料問題
- **可能的錯誤原因**：
  - API `/api/courses?id={courseId}` 未返回 `teacherName` 或 `teacher` 欄位
  - 課程資料在數據庫中缺少教師名稱
  - 課程ID 對應的課程不存在或已刪除
- **驗證方式**：
  1. 檢查 courseMap 中該課程ID 的資料
  2. 驗證後端 API 是否正確返回 teacherName
  3. 檢查數據庫中的課程記錄
  4. 若為空，應記錄課程ID 並回報
- **修復步驟**：
  1. 檢查課程表中的教師賦值
  2. 確認 API 端點正確返回 teacherName / teacher 欄位
  3. 補充或更正課程的教師資訊

### 3. 單堂時間(時長)欄位資料檢查
- **要求**：若單堂時間欄位顯示為 '-'，需檢查課程資料問題
- **可能的錯誤原因**：
  - API 未返回 `durationMinutes` 或值為 0
  - 課程資料中未設定時長
  - 課程ID 對應的課程不存在
- **驗證方式**：
  1. 檢查 courseMap 中該課程 ID 的 `durationMinutes` 是否為有效數字
  2. 驗證後端 API 是否正確返回此欄位
  3. 檢查數據庫中的課程紀錄
  4. 若為 0 或空值，記錄課程ID
- **修復步驟**：
  1. 檢查課程表中 durationMinutes 的值
  2. 確認值 > 0 且為有效數字
  3. 更新課程時長設定

### 4. 開始時間/結束時間欄位正確性
- **要求**：開始時間和結束時間欄位要正確依照課程ID 來顯示，**不使用訂單的付款時間**
- **邏輯說明**：
  - 直接使用課程資料（courseMap）中的時間，而不是訂單對象（order）中的時間
  - **開始時間**：`(nextStartDate || startDate) + startTime` (從課程資料獲取)
  - **結束時間**：`(nextStartDate || startDate) + endTime` (從課程資料獲取，同日期，不同時間)
  - 時間格式：`HH:mm:ss` (24小時制，移除「上下午」標記)
- **修復重點**：
  - ❌ **移除**：`if (o.startTime)` 和 `if (o.endTime)` 的檢查（這些是訂單時間）
  - ✅ **直接使用**：courseMap 中的 startTime 和 endTime（這些是課程時間）
- **驗證方式**：
  1. 檢查開始時間是否使用正確的日期（nextStartDate 優先）
  2. 檢查結束時間是否在同一天（不應使用 endDate）
  3. 驗證時間組合是否合理（endTime > startTime）
  4. 檢查時間格式是否一致
  5. 確認時間來自課程資料，不是來自訂單記錄
- **常見問題**：
  - ❌ 使用 `o.startTime/o.endTime`（訂單付款時間）而非課程的 startTime/endTime
  - ❌ 結束時間錯誤地使用 `endDate` 而非 `startDate/nextStartDate`
  - ❌ 時間字符串中包含中文「上午」「下午」標記，需移除
- **修復步驟**：
  1. 確認開始時間邏輯：只使用 `(nextStartDate || startDate) + startTime`（來自 courseData）
  2. 確認結束時間邏輯：只使用 `(nextStartDate || startDate) + endTime`（來自 courseData）
  3. 清理時間字符串中的非英文標記
  4. 驗證時間組合的合理性
  5. 測試確保顯示的是課程時間而非付款時間

## 測試指令

### 環境變數配置

在運行測試前，確保 `.env.local` 中已配置以下環境變數：

```bash
# 測試時需要的環境變數（示例格式，請填入實際值）
BASE_URL=<application-url>                        # 應用 URL（非必需，預設 http://localhost:3000）
TEST_STUDENT_EMAIL=<student-email>                # 測試學生帳號
TEST_STUDENT_PASSWORD=<student-password>          # 測試學生密碼
LOGIN_BYPASS_SECRET=<bypass-secret>               # 登入驗證碼繞過密鑰
```

### 自動化測試
```bash
# 進入專案目錄
cd $(git rev-parse --show-toplevel)

# 執行完整測試套件
npx playwright test e2e/student_courses_verification.spec.ts
```

**測試文件位置**：`e2e/student_courses_verification.spec.ts`

**測試套件包含**：
- ✅ 檢查1: 進入教室按鈕時間驗證 - 驗證按鈕在時間區間內顯示
- ✅ 檢查2: 老師欄位資料檢查 - 識別缺失的教師信息
- ✅ 檢查3: 單堂時間(時長)欄位資料檢查 - 識別缺失的課程時長
- ✅ 檢查4: 開始時間/結束時間欄位正確性 - 驗證時間格式和計算
- ✅ 綜合驗收清單 - 表格結構和數據完整性檢查

**運行選項**：
```bash
# 以調試模式運行
npx playwright test e2e/student_courses_verification.spec.ts --debug

# 以 UI 模式查看實時執行
npx playwright test e2e/student_courses_verification.spec.ts --ui

# 運行特定測試
npx playwright test e2e/student_courses_verification.spec.ts -g "檢查1"

# 查看 HTML 報告
npx playwright show-report
```

**測試執行指南**：詳見 `e2e/STUDENT_COURSES_TEST_GUIDE.md`

### 手動測試步驟
1. 確認應用正在運行於環境變數 `BASE_URL` 中指定的 URL
2. 以學生身份登入系統
3. 導航至 `/student_courses` 頁面
4. 按照下方「手動驗證清單」逐項檢查
5. 記錄所有顯示為 '-' 或 '(時間缺失)' 的欄位及課程 ID
6. 使用調試流程排查根本原因

## 手動驗證清單

### 驗證項目 1：表格加載
- [ ] 頁面正常加載，無 JavaScript 錯誤
- [ ] 表格的 9 個列標都正確顯示
- [ ] 至少有 1 條課程記錄

### 驗證項目 2：課程數據完整性
對表格中的前 5 條記錄逐一檢查：
- [ ] 學生名稱欄位有值
- [ ] 課程名稱欄位有值且可點擊連結
- [ ] 教師名稱欄位有值（不是 "-"）
- [ ] 單堂時間欄位有值（格式 "X m"，不是 "-"）

### 驗證項目 3：時間欄位正確性
對表格中的前 5 條記錄逐一檢查：
- [ ] 開始時間欄位正確顯示（不是 "(時間缺失)"）
- [ ] 結束時間欄位正確顯示（不是 "(時間缺失)"）
- [ ] 開始時間 < 結束時間
- [ ] 兩個時間使用相同或相近的日期

### 驗證項目 4：進入教室按鈕
- [ ] 按鈕狀態符合時間區間邏輯
- [ ] 當前時間在課程時間內時，至少有 1 個課程的按鈕顯示
- [ ] 當前時間不在課程時間內時，該課程按鈕隱藏為 "-"
- [ ] Hover 隱藏的按鈕時，顯示課程開始/結束時間信息

## 常見問題排查

### 遇到 「(時間缺失)」 顯示的調試流程

**第1步：確認問題現象**
1. 在 `/student_courses` 頁面看到某些課程的「開始時間」或「結束時間」欄位顯示：`日期 (時間缺失)`
2. Hover 該欄位查看 Tooltip 調試信息，格式如下：
   ```
   [DEBUG] Course ID: course_123 - startTime is empty or invalid: "原始值"
   ```

**第2步：檢查 API 返回的原始資料**
1. 打開瀏覽器開發者工具 (F12)
2. 進入「Network」標籤
3. 重新加載 `/student_courses` 頁面
4. 搜尋 API 請求：`/api/courses?id=course_123`（請用實際的課程 ID 替換）
5. 檢查 Response 中的時間欄位：
   - 查看 `startTime` 和 `endTime` 的值
   - 記錄原始值的格式

**第3步：分析時間格式**
根據調試信息中的「原始值」進行分析：

| 原始值格式 | 問題 | 修復方案 |
|-----------|------|--------|
| `null` 或 `undefined` | API 未返回時間 | 檢查數據庫和 `/app/api/courses` 端點 |
| `""` (空字符串) | 時間欄位為空 | 更新課程的 startTime/endTime 設定 |
| `"14:30"` 或 `"14:30:00"` | 格式正常 | 檢查 cleanTimeString 函數是否有 bug |
| `"下午 2:30"` 或 `"14:30 PM"` | 含有 AM/PM 標記 | 需要驗證 cleanTimeString 能否移除這些標記 |
| `"14:30:00.000Z"` | ISO 格式的時間部分 | Regex 應該能提取，若未能則是 Regex bug |

**第4步：驗證 cleanTimeString 函數**
在瀏覽器控制台測試時間清理函數：
```javascript
// 複製此函數到控制台測試
function cleanTimeString(timeStr) {
  if (!timeStr) return '';
  let cleaned = String(timeStr).trim();
  cleaned = cleaned.replace(/[\u4e0a\u4e0b]\u5348/g, '').trim();
  cleaned = cleaned.replace(/\s*(AM|PM|am|pm)\s*/g, '').trim();
  const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hours = timeMatch[1].padStart(2, '0');
    const minutes = timeMatch[2].padStart(2, '0');
    const seconds = (timeMatch[3] || '00').padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  return '';
}

// 測試原始值
console.log(cleanTimeString("14:30"));        // 應該返回: "14:30:00"
console.log(cleanTimeString("下午 2:30"));    // 應該返回: "14:30:00"（如果小時是12h制）
console.log(cleanTimeString("14:30:00.000Z")); // 應該返回: "14:00:00"
```

**第5步：修復根本原因**

根據調試結果選擇修復方案：

#### 方案 A：API 未返回時間（原始值為 null）
**位置**：`/app/api/courses` 或相關的課程資料源
**步驟**：
1. 找到課程 API 端點
2. 確認資料庫中該課程的 startTime/endTime 欄位有值
3. 檢查 API 程式碼是否正確返回這些欄位
4. 修復後重新部署

#### 方案 B：時間欄位為空（原始值為空字符串或 null）
**位置**：課程資料庫
**步驟**：
1. 登入資料庫管理工具
2. 查詢該課程記錄
3. 檢查 startTime 和 endTime 欄位
4. 若為空，補充正確的時間值
5. 若格式錯誤，修正為 `HH:mm` 或 `HH:mm:ss` 格式

#### 方案 C：時間格式不符合 Regex（e.g. 含有意外字符）
**位置**：`/app/student_courses/page.tsx` 中的 `cleanTimeString` 函數
**步驟**：
1. 根據實際的時間格式，擴展 Regex 模式
2. 添加額外的清理邏輯
3. 測試修改後的函數
4. 重新部署

#### 方案 D：時間值在 12 小時制格式且包含 AM/PM
**位置**：`/app/student_courses/page.tsx` 中的 `cleanTimeString` 函數
**步驟**：
1. 確認當前的 cleanTimeString 已經移除 AM/PM 標記
2. 若時間仍然不正確，可能需要轉換 12h → 24h
3. 修改函數以支持 24h 轉換：
```javascript
// 範例：若時間是 "02:30 PM"，應轉換為 "14:30:00"
function convert12to24(timeStr) {
  const isPM = /PM|pm|\u4e0b\u5348/.test(timeStr);
  const cleaned = timeStr.replace(/[^\d:]/g, '');
  const [hours, minutes, seconds] = cleaned.split(':').map(Number);
  let h = hours;
  if (isPM && h !== 12) h += 12;
  if (!isPM && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds || 0).padStart(2, '0')}`;
}
```

**第6步：測試修復**
1. 修復後，清空瀏覽器快取（或 Ctrl+Shift+Delete）
2. 重新加載 `/student_courses` 頁面
3. 確認「開始時間」和「結束時間」欄位正確顯示
4. 驗證「進入教室」按鈕在時間區間內正確顯示

**第7步：驗收清單**
- [ ] 所有課程的開始時間和結束時間都正確顯示（不顯示「時間缺失」）
- [ ] 進入教室按鈕在時間區間內正確切換顯示/隱藏
- [ ] 不同課程的時間組合合理（endTime > startTime）
- [ ] 時間格式一致（都顯示 `日期 時時:分分:秒秒` 的格式）

| 問題 | 原因 | 解決方案 |
|------|------|--------|
| 按鈕一直不顯示 | 時間驗證邏輯有誤 | 檢查當前時間計算和區間比較邏輯 |
| 老師欄位為 '-' | 課程資訊不完整 | 驗證數據庫和API 端點 |
| 時長欄位為 '-' | durationMinutes 為 0 或空 | 更新課程的時長設定 |
| 時間顯示不正確 | 日期/時間字符串拼接錯誤 | 檢查 startDate 和 nextStartDate 邏輯 |
| 顯示「(時間缺失)」| 時間格式無法被 cleanTimeString 解析 | 依照調試流程的第1-7步執行 |

## 相關檔案
- `/app/student_courses/page.tsx` - 主頁面元件
- `/app/api/courses` - 課程API 端點
- `/app/api/orders` - 訂單API 端點
