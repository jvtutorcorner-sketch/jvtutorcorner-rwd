---
name: recommendation-onboarding
description: '驗證首頁推薦系統（混合式權重演算法）與新手引導問卷的整合功能。Use when: testing recommendation API, onboarding questionnaire flow, guest idle detection, survey seed injection, or homepage personalised section.'
argument-hint: '描述要驗證的功能，例如：驗證問卷注入後首頁推薦是否變化、測試訪客閒置觸發問卷'
metadata:
  verified-status: '✅ VERIFIED'
  last-verified-date: '2026-03-15'
  architecture-aligned: true
---

# 推薦系統與 Onboarding 問卷驗證技能

## 適用場景

- 驗證 `/api/recommendations` 回傳正確的 Top-10 課程列表
- 驗證 `/api/survey/seeds` 正確儲存問卷種子並回傳 `newFeatureAffinity`
- 驗證 `OnboardingQuestionnaire` 元件在登入/註冊頁正確觸發
- 驗證訪客閒置 3 分鐘後底部 Drawer 問卷出現
- 驗證 MMR 多樣性懲罰使首頁不出現 100% 同類型課程
- 驗證種子到期（30 天）後推薦退回探索模式

## 架構概覽

```
用戶 / 訪客
   │
   ├── 新用戶 / 訪客 ────────────────────────────────────────────────────
   │     ├── 訪客閒置 3 分鐘        → OnboardingQuestionnaire (mode=lite)
   │     ├── 訪客完成輕量問卷        → POST /api/survey/seeds (guest)
   │     │                            → seeds 存入 localStorage
   │     ├── 訪客請求首頁推薦        → POST /api/recommendations (guestSeeds)
   │     │
   │     └── 註冊成功後             → OnboardingQuestionnaire (mode=full)
   │                                 → POST /api/survey/seeds (userId)
   │                                 → seeds 存入 DynamoDB
   │
   └── 已登入用戶 ────────────────────────────────────────────────────────
         ├── 頁面載入               → GET /api/recommendations?userId=xxx
         └── 首頁顯示               → 「[用戶名] 的專屬推薦」區塊

lib/recommendationEngine.ts    ← 核心演算法（TagScore + MMR + Rules）
lib/surveyTagMap.ts            ← 問卷答案 → 種子標籤對照表
app/api/survey/seeds/route.ts  ← 種子保存 API
app/api/recommendations/route.ts ← 推薦生成 API
components/OnboardingQuestionnaire.tsx ← 問卷 UI 元件
app/ClientHomePage.tsx         ← 首頁整合（推薦區塊 + 閒置偵測）
app/login/register/page.tsx   ← 註冊後顯示問卷
```

## 關鍵檔案

| 檔案 | 用途 |
|------|------|
| `lib/recommendationEngine.ts` | TagScore、MMR、Business Rules 核心函式 |
| `lib/surveyTagMap.ts` | Q1~Q4 答案 → TagSeed 對照表，含探索探針標記 |
| `app/api/survey/seeds/route.ts` | POST：儲存問卷種子（已登入 → DynamoDB；訪客 → 回傳 seeds） |
| `app/api/recommendations/route.ts` | GET/POST：生成 Top-10 推薦列表 |
| `components/OnboardingQuestionnaire.tsx` | 問卷 UI（full 模式 4 題 / lite 模式 2 題） |
| `app/ClientHomePage.tsx` | 首頁：推薦區塊 + 3 分鐘閒置偵測 |
| `app/login/register/page.tsx` | 註冊成功後插入 full 問卷 |

## 驗證檢查清單

### 1. 推薦 API 基本功能

- **端點**：`GET /api/recommendations`（無 userId → 新用戶探索模式）
- **端點**：`GET /api/recommendations?userId=xxx`（已登入用戶）
- **端點**：`POST /api/recommendations` body: `{ guestSeeds: [...] }`
- **要求**：
  - 回傳 `recommendations` 陣列，長度 ≤ 10
  - 回傳 `meta.mmrAlpha`：新用戶應為 0.4，有種子用戶應為 0.6，有真實互動應為 0.7
  - 回傳 `meta.isNewUser: true` 當無任何互動紀錄
  - 回傳 `meta.topTags` 陣列（非空時）
  - 同一 `category` 最多出現 3 次（Frequency Cap）
  - 下架課程（`status = '下架'`）不出現在結果中

### 2. 問卷種子 API

- **端點**：`POST /api/survey/seeds`
- **請求格式**：
  ```json
  {
    "userId": "u_xxx",
    "answers": { "q1": "A", "q2": "B", "q3": ["C"], "q4": "B" }
  }
  ```
- **要求**：
  - 回傳 `{ ok: true, seedCount: N, newFeatureAffinity: bool, persisted: true }`
  - `seedCount > 0`（Q1-A 應產生 3 個種子）
  - 選 Q3-C 或 Q3-D 時 `newFeatureAffinity === true`
  - 訪客請求（無 userId）：`persisted === false`，回傳 `seeds` 陣列

### 3. OnboardingQuestionnaire 元件行為

#### 3a. Full 模式（4 題，post-registration）
- 驗證流程：
  1. 前往 `/login/register`，完成填寫表單並提交
  2. 表單提交成功後頁面應顯示問卷（4 題）
  3. 完成問卷後應導向 `/login`
  4. 點擊「跳過」也應導向 `/login`
- **驗證選擇器**：
  - 問卷容器：包含文字「讓我們幫你找到最適合你的課程 ✦」
  - 進度條：存在 4 個進度點
  - 下一題按鈕：`button` 內含「下一題 →」文字
  - 完成按鈕：最後一題時顯示「查看推薦課程」

#### 3b. Lite 模式（2 題，訪客 idle drawer）
- 驗證流程：
  1. 以 **未登入狀態** 訪問首頁
  2. 等待 3 分鐘不進行任何操作（或在測試中模擬 idle timer）
  3. 底部 Drawer 應出現（包含「30 秒」文案）
  4. 完成問卷後 Drawer 消失，首頁推薦區塊更新
- **注意**：測試中可直接呼叫 `window.__triggerIdleQuestionnaire?.()` 或操控 timer

### 4. 首頁推薦區塊

- **驗證位置**：首頁 `section` 中，在 Tabs 區塊之前
- **已登入用戶**：標題顯示「[名字] 的專屬推薦」
- **未登入訪客**：標題顯示「為你精選的課程」，旁邊有「建立帳號獲得更精準推薦 →」連結
- **載入中**：應顯示「正在計算您的專屬推薦…」
- **課程卡片**：最多顯示 3 張（首頁版面限制）

### 5. MMR 多樣性驗證

- **測試情境**：注入 10 次「英文」標籤種子（英文 TagScore = 約 2.1）
- **預期結果**：
  - 英文課不超過 3 個（Frequency Cap）
  - 至少 1 個非英文分類出現（MMR 多樣性懲罰生效）
  - `meta.mmrAlpha` 正確反映探索程度

### 6. 種子注入後推薦變化

- **測試步驟**：
  1. 呼叫 `POST /api/recommendations`（無種子），記錄第一次結果
  2. 呼叫 `POST /api/survey/seeds`（Q1=A：英文）
  3. 再次呼叫 `POST /api/recommendations`（帶種子），比較結果
- **預期**：第二次結果中英文相關課程排名更高

---

## 測試環境設定

### 環境變數

```bash
# .env.local（示例格式）
BASE_URL=http://localhost:3000
TEST_STUDENT_EMAIL=<student-email>
TEST_STUDENT_PASSWORD=<student-password>
LOGIN_BYPASS_SECRET=<bypass-secret>
DYNAMODB_TABLE_USER_INTERACTIONS=jvtutorcorner-user-interactions
```

### 執行測試

```bash
# 進入專案目錄
cd $(git rev-parse --show-toplevel)

# 執行推薦系統驗證測試套件
npx playwright test e2e/recommendation_onboarding.spec.ts

# 或執行特定測試
npx playwright test e2e/recommendation_onboarding.spec.ts --grep "survey seeds"
```

---

## 自動化測試腳本

**測試文件位置**：`e2e/recommendation_onboarding.spec.ts`

**測試套件包含**：

### Suite A：API 單元驗證

| 測試名稱 | 方法 | 預期 |
|---------|------|------|
| GET /api/recommendations (no userId) | GET | 200, isNewUser=true, mmrAlpha=0.4 |
| POST /api/survey/seeds (guest) | POST | 200, persisted=false, seeds array |
| POST /api/survey/seeds (authenticated) | POST | 200, persisted=true |
| POST /api/recommendations (guestSeeds) | POST | 200, recommendations.length ≤ 10 |
| Frequency Cap: same category ≤ 3 | GET | category count ≤ 3 |
| newFeatureAffinity: Q3-C selection | POST | newFeatureAffinity=true |

### Suite B：UI 流程驗證

| 測試名稱 | 頁面 | 預期 |
|---------|------|------|
| 問卷在註冊後出現 | /login/register | 出現 4 題問卷 |
| 問卷完成後導向登入 | /login/register | router.push('/login') |
| 首頁推薦區塊渲染 | / | 顯示「專屬推薦」或「為你精選」 |
| 訪客閒置觸發 Drawer | / | Drawer 出現（模擬 timer） |
| Guest Drawer 完成後推薦更新 | / | recommendations 重新載入 |
