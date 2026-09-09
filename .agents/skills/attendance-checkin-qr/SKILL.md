---
name: attendance-checkin-qr
description: '驗證 QR 報到核銷系統：學員動態票券頁、助教掃碼、報到核銷 API 與報到通知信。'
argument-hint: '驗證 QR 報到核銷與票券信流程'
metadata:
  verified-status: '🔄 IN-PROGRESS'
  last-verified-date: '2026-08-04'
  architecture-aligned: true
  related-skills: [auto-login, student-enrollment-flow, email-notification-testing]
---

# QR 報到核銷技能 (Attendance Check-in QR Skill)

此技能驗證「QR Code 掃碼報到核銷」功能：學員報名成功後透過 Email 收到專屬報到票券連結（`/ticket/[token]`），上課當天由助教/教師在 `/teacher/scanner` 掃描該 QR Code，完成出席核銷。

## 功能特點

1. **一張票券對應一個訂單**：`token` 是對 `orderId` 做 HMAC 簽章而來（`lib/ticket/ticketToken.ts`），套票課程重複使用同一張票，每次掃描各自寫入一筆出席紀錄（`jvtutorcorner-attendance`），因此仍能累積完整出席歷史。
2. **票券頁免登入即可查看**：與既有的 email 驗證連結（`verify-email`）同一種信任模型——連結只寄給本人，token 本身即為持有證明。
3. **3 小時防重複掃描視窗**：同一張票在 3 小時內重複掃描會回傳 `duplicate:true`，不會重複寫入。
4. **教師只能掃自己課程的票**：`role:'teacher'` 掃描時會比對 `course.teacherId`，`admin` 不受此限制。
5. **報到信走既有 Nodemailer 管線**：不是 AWS SES，而是沿用 `lib/email/verificationService.ts`/`gmail-send` 同款的 Gmail SMTP + Resend fallback + 白名單機制。

## 環境準備

在 `.env.local` 中需要（多數已是既有測試帳號變數，無需新增）：
```bash
# 既有的測試帳號與登入繞過（多數專案已設定）
LOGIN_BYPASS_SECRET=<...>
TEST_TEACHER_EMAIL=<...>
TEST_TEACHER_PASSWORD=<...>
TEST_STUDENT_EMAIL=<...>
TEST_STUDENT_PASSWORD=<...>

# 本功能新增（皆可選，有預設值）
TICKET_TOKEN_SECRET=<...>          # 未設定則回退 SESSION_SECRET → API_HMAC_SECRET
DYNAMODB_TABLE_ATTENDANCE=jvtutorcorner-attendance
```

執行自動化測試前，`cloudformation/dynamodb-attendance-table.yml` 定義的 `jvtutorcorner-attendance` 表必須已部署到實際使用的 AWS 帳號/環境。

## 測試流程

### 1. 使用現有測試腳本
```bash
npx playwright test e2e/attendance_checkin_qr.spec.ts --project=chromium
```
腳本流程（見 `e2e/attendance_checkin_qr.spec.ts` + `e2e/helpers/attendance-materials-helpers.ts`）：
1. 教師登入 → 建立並核准一堂測試課程。
2. 學生登入 → 直接 `POST /api/orders` 建立一筆 `status:'PAID'` 的測試訂單。
3. 測試腳本在本地重現 `signOrderToken` 的 HMAC 簽章邏輯算出 token（無法真的收信）。
4. 未登入 context 開啟 `/ticket/{token}` → 應 200，內容含課程標題與 `<svg>` QR Code。
5. 未登入直接打 `POST /api/attendance/checkin` → 應 401。
6. 教師 context 掃描（`POST /api/attendance/checkin`）→ 應成功、`duplicate:false`。
7. 教師再次掃描同一張票 → 應 `duplicate:true`。
8. 竄改 token 簽章後掃描 → 應 400。

### 2. 手動驗證步驟
1. 以測試學生帳號購買一堂點數課程，確認信箱收到「報名成功！您的報到票券」信件（需白名單放行該收件信箱，見 `lib/email/whitelist.ts`）。
2. 點擊信中連結，確認 `/ticket/[token]` 免登入即可開啟，顯示 QR Code 與課程資訊。
3. 用手機瀏覽器開啟教師帳號的 `/teacher/scanner`，允許相機權限，實際掃描步驟 2 的 QR Code → 確認出現綠色「✅ 報到成功」卡片並顯示學生姓名。
4. 立刻重新整理再掃一次同一張票 → 確認出現黃色「⚠️ 已於稍早報到」提示。
5. 在瀏覽器設定中拒絕相機權限後重新載入 `/teacher/scanner` → 確認出現「相機權限被拒絕」提示與手動輸入欄位，畫面不應白屏或壞掉。
6. **跨課程教師拒絕檢查**（不納入自動化，需第二組教師測試帳號）：用非該課程擁有者的教師帳號掃描同一張票 → 應顯示錯誤（伺服器回 403）。

### 檢查點清單
- [ ] `/ticket/[token]` 免登入可開啟且顯示正確課程資訊
- [ ] 掃描成功寫入 `jvtutorcorner-attendance`（可用 `OrderIdIndex` 查詢驗證）
- [ ] 3 小時內重複掃描不寫入新紀錄
- [ ] 竄改 token 被 400 拒絕
- [ ] 非本課程教師掃描被 403 拒絕
- [ ] 報到信透過白名單機制正確送達（或被正確擋下，若收件人不在白名單）
- [ ] 相機權限被拒絕時顯示手動輸入 fallback，不崩潰

## 相關檔案
- `app/ticket/[token]/page.tsx`：學員票券頁（Server Component，免登入）。
- `app/teacher/scanner/page.tsx` + `components/AttendanceScanner.tsx`：教師掃描 UI（`html5-qrcode`）。
- `components/TicketQrCode.tsx`：票券頁 QR Code 渲染（`qrcode.react`）。
- `app/api/attendance/checkin/route.ts`：核銷 API（`withAuth`，僅 `teacher`/`admin`）。
- `lib/ticket/ticketToken.ts`：票券 token 簽章/驗證。
- `lib/email/checkinTicketService.ts` + `lib/email/checkinTicketTrigger.ts`：報到信寄送與觸發時機（訂單轉 `PAID` 時）。
- `cloudformation/dynamodb-attendance-table.yml`：出席紀錄表定義。
- `e2e/attendance_checkin_qr.spec.ts`：自動化測試腳本。
- `e2e/helpers/attendance-materials-helpers.ts`：共用測試工具（與 [materials-pdf-preview](../materials-pdf-preview/SKILL.md) 共用）。

## 故障排除
- **票券頁顯示「無效的票券連結」**：檢查產生連結時的 `TICKET_TOKEN_SECRET`/`SESSION_SECRET` 與驗證當下讀到的是否為同一組值（不同環境/實例間的 secret 必須一致）。
- **掃描永遠回 403**：檢查測試課程的 `teacherId` 是否真的等於登入教師的 `roid_id`/`id`（不是 email）——`app/api/attendance/checkin/route.ts` 用 `course.teacherId === session.userId` 比對。
- **信件沒收到**：檢查 `lib/email/whitelist.ts` 的 `isEmailWhitelisted()`——本機/測試環境常見 `EMAIL_WHITELIST` 未包含測試收件信箱。
- **重複掃描沒有被標記為 duplicate**：確認 `jvtutorcorner-attendance` 表的 `OrderIdIndex` GSI 已正確部署（`cloudformation/dynamodb-attendance-table.yml`）。
