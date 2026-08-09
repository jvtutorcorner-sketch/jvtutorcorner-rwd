# 教學教材影像分析模組：交給其他 AI 的修正 Prompt

以下內容可以直接貼給其他 AI。請讓對方以目前 repository 的實際程式碼為準，不要把舊文件或舊藥品功能當成產品需求。

```text
你是 JV Tutor Corner 的資深全端工程師、資安工程師與測試工程師。請把目前錯誤的「商品／藥品辨識與問卷」模組，完整修正為符合線上教學平台的「教學教材／課程內容影像分析與學習問卷」模組。

工作目標：
1. 學員可以上傳教材、講義、題目、圖表、投影片或手寫筆記圖片。
2. 系統可以整理可確認的教材文字、標題、摘要、關鍵概念、難度與理解檢核問題。
3. 學員可以使用既有的 `/questionnaire/learning` 學習需求問卷，不能再使用藥品症狀問卷。
4. 分析結果只能作為學習輔助，不得提供醫療／法律診斷，也不得因辨識結果修改 Profile 或發放點數。
5. 舊 `/medicine-product`、`/product-scan`、`/products` 路徑如果需要相容，必須 redirect 到新的教學模組；不能繼續顯示藥品或商品商城。

先讀取：
- `docs/b2b-b2c-module-matrix.md`
- `docs/b2b-b2c-architecture-boundary.md`
- `.agents/skills/enterprise-general-test-coverage/SKILL.md`
- `.agents/skills/learning-content-analysis/SKILL.md`
- `scripts/audit-enterprise-general-module-matrix.mjs`
- `app/questionnaire/[mode]/page.tsx`
- `app/api/questionnaire/route.ts`
- `lib/questionnaireService.ts`
- `lib/auth/apiGuard.ts`
- `lib/accessControl.ts`

不要直接刪除既有測試，也不要使用 `test.skip` 把失敗流程變成綠燈。若某能力真的缺少架構或外部 fixture，必須回報 BLOCKED，而不是假裝完成。

一、UI 要求

建立或確認：
- `app/learning-content/page.tsx`
- `app/learning-content/questionnaire/page.tsx`

頁面必須：
- 顯示「教材影像分析與學習回饋」或同等教學平台文案。
- 支援 JPG、PNG、WEBP；限制檔案大小；顯示預覽與錯誤狀態。
- 顯示摘要、關鍵概念、辨識文字、難度、信心值與理解檢核問題。
- 提供前往 `/questionnaire/learning` 的入口。
- 不得出現商品、藥品、藥丸、症狀、用藥或點數兌換文案。
- 不得使用 `lib/mockAuth` 判斷登入狀態；API 必須使用真正 session。

二、API 與權限要求

建立或確認：
- `app/api/learning-content-analysis/route.ts`
- `lib/learningContentAnalysis.ts`

API 必須：
- 使用 `withAuth`，匿名請求回 401。
- 支援 `imageBase64`、`mimeType`、可選 `courseId`。
- 只允許安全的圖片 MIME type，限制 payload 大小。
- 有 `courseId` 時，非 admin/system 必須通過 `verifyCourseAccess`；無 B2C enrollment 或有效 B2B License 回 403。
- AI provider 未設定、provider 失敗或 JSON 無效時回傳明確的 503／錯誤，不得回傳假成功。
- 使用教育內容 JSON schema，例如：
  `{ contentType, title, summary, extractedText, keyConcepts, difficulty, suggestedQuestions, confidence }`。
- 只描述圖片中能確認的內容；模糊內容回 `unknown`、空字串或空陣列，不可猜測。
- 不得呼叫 `/api/profile` 修改點數、角色或其他敏感欄位。

三、舊路由處理

- `/medicine-product`、`/medicine-product/questionnaire`、`/product-scan`、`/products`、`/products/add` 應 redirect 到新的教學內容頁或學習問卷。
- 舊 `/api/scan-product` 若保留，必須使用真正 session，不能信任 client email，不能寫入 `.uploads` 任意路徑，不能發點數；建議回傳 deprecated 與新的 analysis 結構。
- 盤點 `app/api/image-analysis`、LINE webhook、workflow image-analysis node、App integration prompt，移除藥品辨識預設 prompt，改成教育內容分析；若為外部相容功能，清楚標記 legacy。

四、問卷要求

- 重用現有 `/questionnaire/learning`、`app/api/questionnaire/route.ts`、`lib/questionnaireService.ts`。
- 問卷回答要能儲存、產生推薦 seed，並能顯示成功／失敗狀態。
- 不要再保留以症狀、藥物過敏、用藥安全為內容的 `MedicineQuestionnaire` 作為教學模組主流程。

五、測試要求

新增或更新：
- `e2e/learning_content_analysis.spec.ts`

至少驗證：
1. `/learning-content` 顯示正確教學平台標題與教材上傳入口。
2. `/learning-content/questionnaire` 導向 `/questionnaire/learning`。
3. `/medicine-product` 與 `/product-scan` 導向新的教學模組。
4. 匿名 POST `/api/learning-content-analysis` 回 401。
5. 匿名 POST 舊 `/api/scan-product` 回 401，不能發點數。
6. 不支援 MIME type 回 415，超大檔案回 413。
7. 指定 `courseId` 時，未購課程／無 License 回 403。
8. AI 沒有設定或分析結果無效時，UI 顯示可理解的錯誤。
9. 問卷主流程仍能提交並呼叫 `/api/questionnaire`。

測試不得把真實金流、正式 DynamoDB 或真實 AI provider 當成一般 CI smoke test。需要外部 provider 的成功路徑，使用明確 fixture 或標記 BLOCKED，不能用 skip 假裝 COVERED。

六、文件與 skill 同步

更新：
- `docs/b2b-b2c-module-matrix.md`
- `docs/b2b-b2c-architecture-boundary.md`
- `docs/api_registry.md`
- `.agents/skills/learning-content-analysis/SKILL.md`
- `.agents/skills/learning-content-analysis/docs/labeling-guide.md`
- `scripts/audit-enterprise-general-module-matrix.mjs`

模組名稱應為「教學教材／內容影像分析與學習問卷」，狀態依實際證據判斷。若只有安全邊界與 UI，應為 PARTIAL；只有在 AI provider、資料保存、課程權限與完整測試都有證據後，才可標為 COVERED。

API route 有新增或修改時執行：
`node scripts/inspect_apis.mjs`

七、驗證與回報

執行：
- `npx tsc --noEmit`
- `npx playwright test e2e/learning_content_analysis.spec.ts --list`
- `node scripts/audit-enterprise-general-test-coverage.mjs`
- `node scripts/audit-enterprise-general-module-matrix.mjs`
- `npm.cmd run skills:validate`
- `git diff --check`

最後回報：
- 修改過的檔案。
- UI／API／Service／Data／Auth／Test 各層證據。
- 實際通過、失敗、skip、blocked 的測試數量。
- 尚未完成的 AI provider、資料保存、PDF、課程 fixture 缺口。
- 不得宣稱只因 route 存在或返回 200 就是功能完成。
```
