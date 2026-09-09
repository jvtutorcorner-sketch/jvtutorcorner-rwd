---
name: materials-pdf-preview
description: '驗證講義「僅供線上預覽」機制：教師上傳教材、S3 受保護串流、以及報名學生才能預覽的存取控管。'
argument-hint: '驗證講義線上預覽與防下載機制'
metadata:
  verified-status: '🔄 IN-PROGRESS'
  last-verified-date: '2026-08-04'
  architecture-aligned: true
  related-skills: [attendance-checkin-qr, student-enrollment-flow]
  latest-fixes:
    - date: '2026-08-04'
      issue: 'lib/accessControl.ts 的 verifyCourseAccess() 用 studentID/courseID 過濾 jvtutorcorner-enrollments，但 app/api/enroll/route.ts 實際寫入的欄位是 userId/courseId（小寫 d），導致 B2C 報名學生永遠無法通過檢查（含本功能與既有的 app/api/whiteboard/room/route.ts）。'
      solution: '改為以 userId/courseId 過濾，與實際寫入欄位一致。'
      files-modified: [lib/accessControl.ts]
---

# 講義線上預覽技能 (Materials PDF Preview Skill)

此技能驗證「教材僅供線上預覽、不開放下載」功能：教師上傳 PDF 講義後，只有該課程的已報名學生能透過受保護的串流 API 在課程詳情頁以 canvas 預覽，未報名/未登入者一律被擋下。

## 功能特點

1. **不暴露真實 S3 URL**：預覽走 `GET /api/courses/[id]/materials/preview`，伺服器端用 `getObjectBuffer` 把 PDF bytes 讀出來再回傳（`Content-Disposition: inline`、`Cache-Control: private, no-store`），不是簽 GET URL 後 redirect。
2. **canvas 渲染 + 無下載按鈕 + 封鎖右鍵**：沿用既有 `pdfjs-dist`（`components/PdfViewer.tsx` 的白板預覽同一套渲染方式），新元件 `components/ProtectedPdfPreview.tsx` 移除了「Download Page as Image」按鈕並攔截 `onContextMenu`。
3. **⚠️ 誠實揭露**：上述機制只能提高一般使用者下載的門檻，**不是**密碼學等級的防下載——screenshot、DevTools 讀取 canvas 像素、螢幕錄影仍可繞過。
4. **存取控管沿用 `verifyCourseAccess`**（`lib/accessControl.ts`）：檢查 `jvtutorcorner-enrollments` 是否有該學生對該課程的 `PAID`/`ACTIVE` 報名紀錄，教師本人與 `admin` 另有 bypass。

## 環境準備

```bash
# 既有的測試帳號與登入繞過
LOGIN_BYPASS_SECRET=<...>
TEST_TEACHER_EMAIL=<...>
TEST_TEACHER_PASSWORD=<...>
TEST_STUDENT_EMAIL=<...>
TEST_STUDENT_PASSWORD=<...>

# 本功能需要真實可寫入的 S3 bucket（presign + PUT 都是真的打 S3）
AWS_S3_BUCKET_NAME=<...>
AWS_REGION=<...>
AWS_ACCESS_KEY_ID=<...>
AWS_SECRET_ACCESS_KEY=<...>
```

## 測試流程

### 1. 使用現有測試腳本
```bash
npx playwright test e2e/materials_pdf_preview.spec.ts --project=chromium
```
腳本流程（見 `e2e/materials_pdf_preview.spec.ts` + `e2e/helpers/attendance-materials-helpers.ts`，PDF fixture 用既有的 `public/test-pdfs/test-single-page.pdf`）：
1. 教師登入 → 建立測試課程 → `POST .../materials/presign` → `PUT` 檔案至 S3 → `PATCH .../materials` 寫入教材紀錄。
2. 未登入 context：課程頁只看到登入提示、看不到檔名；直打 preview API → 401。
3. 已登入但未報名的學生：課程頁看到「報名課程後即可預覽」；直打 preview API → 403。
4. 帶跨課程前綴的 `key` 打 preview API → 400（防止拿別課程授權讀這堂課的檔案，反之亦然）。
5. 用 `POST /api/enroll` + `PATCH status:'ACTIVE'` 讓學生真正成為已報名學生（**注意**：這裡是 enrollments 表，不是 orders 表——`verifyCourseAccess` 只認 enrollments）。
6. 已報名學生：課程頁看得到教材檔名；直打 preview API → 200，且回應標頭正確為 `Content-Type: application/pdf` / `Content-Disposition: inline` / `Cache-Control: private, no-store`，body 開頭為 `%PDF`。

### 2. 手動驗證步驟
1. 教師登入 `/courses_manage/{id}/edit`，用「教材上傳」區塊上傳一份 PDF。
2. 用未報名該課程的學生帳號開啟 `/courses/{id}` → 確認顯示「報名課程後即可預覽教材」，看不到檔案。
3. 報名該課程後重新整理 → 確認「教材預覽」區塊列出教材檔名，點擊後彈出預覽視窗。
4. 在預覽視窗內容區域按右鍵 → 確認瀏覽器右鍵選單被封鎖（不會跳出「另存圖片」）。
5. 確認預覽視窗內**沒有**任何下載/匯出按鈕。
6. 開啟瀏覽器 DevTools → Network 分頁，找到 `materials/preview` 請求，確認 Response Headers 含 `Content-Disposition: inline` 與 `Cache-Control: private, no-store`。

### 檢查點清單
- [ ] 教師可成功上傳教材（presign → S3 PUT → PATCH 寫入紀錄）
- [ ] 未登入訪客看不到教材清單，直打 API 得 401
- [ ] 未報名學生看不到教材，直打 API 得 403
- [ ] 跨課程 key 被 400 拒絕
- [ ] 已報名學生可預覽，回應標頭無 `attachment`、含 `no-store`
- [ ] 預覽視窗無下載按鈕、右鍵選單被封鎖

## 相關檔案
- `app/api/courses/[id]/materials/presign/route.ts`：教師專用，產生 S3 presigned PUT URL。
- `app/api/courses/[id]/materials/route.ts`：`GET` 列表 / `PATCH` 附加教材紀錄。
- `app/api/courses/[id]/materials/preview/route.ts`：受保護串流 API（存取控管核心）。
- `components/ProtectedPdfPreview.tsx`：canvas 渲染、無下載、封鎖右鍵。
- `components/MaterialsPreviewSection.tsx`：課程頁教材清單 + 觸發預覽 modal。
- `app/courses/[id]/page.tsx`：課程詳情頁「教材預覽」區塊（session 解析 + `verifyCourseAccess` 三態顯示）。
- `app/courses_manage/[id]/edit/page.tsx`：教師教材上傳 UI。
- `lib/accessControl.ts`：`verifyCourseAccess()`（本次已修正欄位名稱錯誤，見上方 `latest-fixes`）。
- `e2e/materials_pdf_preview.spec.ts`：自動化測試腳本。
- `e2e/helpers/attendance-materials-helpers.ts`：共用測試工具（與 [attendance-checkin-qr](../attendance-checkin-qr/SKILL.md) 共用）。

## 故障排除
- **已報名學生仍被 403**：
  1. 先確認 `jvtutorcorner-enrollments` 裡確實有一筆 `userId`=該學生、`courseId`=該課程、`status` 為 `PAID`/`ACTIVE` 的紀錄（用「訂單 PAID」誤以為等於「已報名」是常見誤區——訂單表與報名表是兩張不同的表）。
  2. 若上述紀錄存在但仍被拒，檢查 `lib/accessControl.ts` 的 `stripTabId()`：它會把 `session.userId` 中「最後一個底線之後」的字串切掉（設計原意是去除客戶端分頁識別後綴），但若該使用者的 `roid_id` 剛好是 `u_<timestamp>` 這種形狀（`app/api/register/route.ts` 的 fallback 產生規則），會被誤判為含 tabId 後綴而遭截斷，導致與 enrollments 紀錄的 `userId` 對不上。這是已知但**尚未修復**的潛在問題，遇到時請確認測試帳號的 `roid_id`/`id` 是否恰好符合此形狀。
- **presign 失敗**：檢查 `AWS_S3_BUCKET_NAME`/AWS 憑證是否已設定（`lib/s3.ts` 的 `getPresignedPutUrl` 找不到 bucket 會直接丟錯）。
- **合法請求被 400 擋下**：確認前端組出的 `key` 是否符合 `course-materials/{courseId}/...` 命名慣例（`preview` 路由用 `key.startsWith()` 做跨課程防護）。
