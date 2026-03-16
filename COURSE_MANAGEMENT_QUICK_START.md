# 課程管理服務技能 - 快速使用指南

## 🎯 這個 SKILL 是什麼？

**course-management-service** 技能負責處理：
- 👨‍🏫 **老師端**: 在 `/courses_manage` 建立、編輯、管理課程
- 🔍 **管理員端**: 在 `/admin/course-reviews` 審核課程申請

## ⚡ 快速開始

### 步驟 1: 啟動應用
```bash
npm run dev
# 應用將在 http://localhost:3000 啟動
```

### 步驟 2: 運行自動化測試 (推薦)
```bash
npx playwright test e2e/course_management_flow.spec.ts
```

### 步驟 3: 查看測試報告
```bash
# 最新報告
cat COURSE_MANAGEMENT_TEST_REPORT.md

# Playwright 測試報告
npx playwright show-report
```

---

## 📍 主要頁面位置

| 功能 | URL | 帳號 | 說明 |
|------|-----|------|------|
| **老師課程列表** | `/courses_manage` | lin@test.com | 查看和編輯所有課程 |
| **建立新課程** | `/courses_manage/new` | lin@test.com | 新增課程表單 |
| **管理員審核** | `/admin/course-reviews` | admin@jvtutorcorner.com | 審核待審核課程 |

---

## 🔐 測試帳號

| 角色 | Email | 密碼 | 用途 |
|------|-------|------|------|
| 老師 | `lin@test.com` | `123456` | 建立和管理課程 |
| 管理員 | `admin@jvtutorcorner.com` | `123456` | 審核課程 |

**登入時的驗證碼**: `jv_secret_bypass_2024`

---

## 🧪 完整流程驗證清單

### 🟢 老師端 (✅ 已驗證)

- [x] 登入成功
- [x] 進入 `/courses_manage` 查看課程列表
- [x] 點擊「新增課程」導航至 `/courses_manage/new`
- [x] 填寫表單 (標題、描述、時間、點數)
- [x] 提交課程 → 狀態自動設為「待審核」
- [x] 新課程在列表中可見

### 🟡 管理員端 (✅ 登入已驗證)

- [x] 登入成功
- [x] 進入 `/admin/course-reviews` 頁面
- [ ] 查看待審核課程清單 (需進一步驗證篩選)
- [ ] 核准課程 → 狀態變更為「上架」
- [ ] 駁回課程 → 狀態變更為「已駁回」

---

## 📊 API 端點

| 方法 | 端點 | 功能 |
|------|------|------|
| `POST` | `/api/courses` | 建立新課程 |
| `GET` | `/api/courses` | 獲取課程列表 |
| `GET` | `/api/courses/{id}` | 獲取課程詳情 |
| `PUT` | `/api/courses/{id}` | 更新課程 |
| `POST` | `/api/admin/course-reviews/{id}` | 審核課程 (核准/駁回) |

---

## 💡 常見問題

### Q: 新課程建立後沒有出現在列表中？
**A**: 頁面可能需要刷新。測試會自動返回 `/courses_manage` 以確保課程可見。

### Q: 課程狀態顯示為「待審核」是正常的嗎？
**A**: 是的！新課程建立時會自動進入「待審核」狀態，等待管理員審核後才能上架。

### Q: 如何驗證管理員審核功能？
**A**: 
1. 老師端建立課程 (狀態: 待審核)
2. 管理員登入進入 `/admin/course-reviews`
3. 尋找該課程並點擊「核准」
4. 課程狀態應變更為「上架」

### Q: 測試失敗了怎麼辦？
**A**: 
1. 檢查伺服器是否運行: `npm run dev`
2. 清除瀏覽器 cache: `Ctrl+Shift+Delete`
3. 檢查 `.env.local` 的帳號設定
4. 查看 Playwright 截圖: `test-results/` 目錄

---

## 📝 表單欄位規則

| 欄位 | 類型 | 必填 | 限制 | 範例 |
|------|------|------|------|------|
| 課程標題 | 文字 | ✅ | 無 | "自動化測試課程" |
| 課程描述 | 文字 | ✅ | 無 | "這是課程描述" |
| 開始時間 | 日期時間 | ✅ | 未來日期 | 2026-03-22 |
| 結束時間 | 日期時間 | ✅ | 晚於開始時間 | 2026-03-23 |
| 點數費用 | 數字 | ✅ | 7-40 | 10 |

---

## 🔧 高級用法

### 運行特定測試
```bash
# 只運行建立課程的測試
npx playwright test e2e/course_management_flow.spec.ts --grep "建立"

# 帶詳細日誌
npx playwright test e2e/course_management_flow.spec.ts --reporter=list
```

### 除錯模式
```bash
# 開啟 Playwright Inspector
npx playwright test e2e/course_management_flow.spec.ts --debug
```

### 匯出測試報告
```bash
# HTML 報告
npx playwright test e2e/course_management_flow.spec.ts --reporter=html
open playwright-report/index.html
```

---

## 📚 相關文件

- 技能文件: [SKILL.md](.agents/skills/course-management-service/SKILL.md)
- 測試報告: [COURSE_MANAGEMENT_TEST_REPORT.md](COURSE_MANAGEMENT_TEST_REPORT.md)
- 測試文件: [e2e/course_management_flow.spec.ts](e2e/course_management_flow.spec.ts)

---

## 🎓 學習資源

### 課程模型 (Data Structure)
查看 `architecture_overview.md` 的「12. Data Models」章節，了解課程的完整資料結構。

### 相關技能
- **auto-login**: 自動登入與 CAPTCHA 繞過
- **student-enrollment-flow**: 學生報名流程 (參考實作)
- **teacher-courses-page**: 老師課程頁面驗證

---

## ✅ 驗證清單

使用此 SKILL 時，確認以下事項：

- [ ] 開發伺服器已啟動 (`npm run dev`)
- [ ] `.env.local` 中有正確的測試帳號
- [ ] 測試可以成功連接 `localhost:3000`
- [ ] 老師課程建立流程完成
- [ ] 課程在列表中可見
- [ ] 課程狀態正確顯示為「待審核」

---

**最後更新**: 2026-03-15  
**測試狀態**: ✅ 通過 (1/1)  
**推薦用法**: 自動化 E2E 測試 + 手動驗證關鍵路徑
