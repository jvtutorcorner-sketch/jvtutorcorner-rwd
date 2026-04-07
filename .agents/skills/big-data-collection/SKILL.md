---
name: big-data-collection
description: '負責大數據推薦課程的前置數據收集規劃與實作。包含行為追蹤 (Behavioral Tracking)、冷啟動問卷整合、以及推薦系統擴展。'
---

# 大數據推薦課程 - 資料收集規劃 (Big Data Collection Strategy)

## 適用場景

- **用戶行為追蹤 (User Behavior Tracking)**：收集點擊、瀏覽時長、搜尋紀錄。
- **冷啟動處理 (Cold Start Handling)**：透過 Onboarding 問卷在用戶首次進入時預先收集偏好。
- **閒置引導 (Idle Conversion)**：針對訪客在頁面閒置時，引導填寫輕量問卷以建立初始畫像。
- **推薦精度提升**：從標籤過濾 (Tag Filtering) 轉向協同過濾 (Collaborative Filtering) 的數據準備。

## 數據收集流程 (Current vs. Future)

### 1. 冷啟動階段階 (Cold Start Phase) - 已實作
透過 `OnboardingQuestionnaire` 在註冊或訪客閒置時觸發：
- **註冊後問卷**：收集學習目標、感興趣的分類。
- **訪客閒置問卷**：偵測 3 分鐘不活動後觸發底部 Drawer，轉化訪客為帶有 Label 的潛在用戶。

### 2. 即時行為階段 (Real-time Behavior) - 規劃中
追蹤用戶與平台的真實互動：
- **點擊行為 (Click Stream)**：點擊了哪個 `CourseCard`？
- **瀏覽深度 (Scroll Depth)**：是否看完了課程介紹？
- **購買行為 (Purchase History)**：真實的成交轉換數據。

---

## 大數據收集前提條件 (Prerequisites Checklist)

為了達成未來的大數據推薦，必須先滿足以下系統與數據條件：

### 1. 用戶身份識別系統 (Unified User Identity)
- [ ] **訪客追蹤**：使用 `localStorage` (如 `jv_survey_seeds`) 或持久化 Session Cookie 追蹤未登入用戶。
- [ ] **帳號綁定**：登入後自動將訪客期間的行為數據 (`guestSeeds`) 合併至正式帳號。

### 2. 數據埋點標準化 (Tracking Instrumentation)
- [ ] **通用事件定義**：定義 `view_course`, `select_tab`, `search_query` 等標準化事件。
- [ ] **自動化埋點**：在 `CourseCard` 或通用元件中加入自動追蹤邏輯。

### 3. 可擴展的存儲架構 (Scalable Storage)
- [ ] **熱數據 (Hot Data)**：存放在 DynamoDB 或 Redis，供即時推薦引擎 (`/api/recommendations`) 讀取。
- [ ] **冷數據 (Cold Data)**：存放在 S3 或 Data Lake，供離線訓練模型 (ML Training) 使用。
- [ ] **TTL 機制**：如目前的 `expiresAt` (30天)，確保數據時效性。

### 4. 推薦引擎演算法演進
- [ ] **基於標籤 (Tag-based)**：目前實作，透過 `TagScore` 與 `MMR` 進行權重排序。
- [ ] **基於矩陣 (Matrix-based)**：未來目標，收集足夠的 User-Item 互動矩陣進行推薦。

### 5. 轉化路徑優化
- [ ] **Idle Detection**：目前的 3 分鐘閒置機制，用於轉化「沈默訪客」為「標籤訪客」。
- [ ] **Feedback Loop**：收集用戶對推薦結果的滿意度（如：點擊「不感興趣」）。

---

## 關鍵實作參考 (Key Implementations)

1. **問卷種子保存 API**：`app/api/survey/seeds/route.ts`
   - 負責將 Q1-Q4 轉換為 `tag` 與 `weight` 存入 DynamoDB。
2. **推薦引擎邏輯**：`lib/recommendationEngine.ts`
   - 使用 `TagScore + MMR (Maximal Marginal Relevance)` 確保推薦結果的多樣性。
3. **訪客閒置偵測**：`app/ClientHomePage.tsx`
   - 監聽 `mousemove`, `keydown` 等事件，適時觸發 `OnboardingQuestionnaire` (lite 模式)。

---

## 整合測試與導覽列驗證 (Integration with Navbar-Verification)

大數據收集的有效性依賴於正確的用戶身份狀態，這部分需與 `navbar-verification` 協同驗證：

### 1. 跨功能測試清單 (Cross-Functional Checklist)
- [ ] **身分狀態同步**：驗證註冊成功後，Navbar 正確切換為登入狀態（Email/頭像），且 `jv_just_registered` 標記同時觸發大數據問卷。
- [ ] **權限過濾驗證**：確保不同角色（Student/Teacher）看到的推薦內容與問卷邏輯一致。
- [ ] **導航攔截**：驗證在強導覽模式（Product Tour）中，問卷步驟是否與導覽步驟正確銜接，不被 Navbar 的頁面切換中斷。

### 2. 核心驗證腳本
*   **UI 層級**：`e2e/navbar_verification.spec.ts` 
    - 驗證註冊 -> 自動登入 -> 導覽列狀態。
*   **數據與算法層級**：`e2e/recommendation_onboarding.spec.ts`
    - 驗證 3 分鐘閒置 -> 問卷彈出 -> 推薦結果變更。

---

## 未來擴展方向

- **A/B Testing**：測試不同問卷題項對推薦點擊率的影響。
- **動態權重**：根據用戶最近期的行為（如 1 小時內的搜尋）給予更高的推薦權重。
- **跨平台同步**：確保 Web 與 Mobile 收集到的數據有一致的標籤系統 (`lib/surveyTagMap.ts`)。
