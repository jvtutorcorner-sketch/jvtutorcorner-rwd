# Skill 驗證狀態追蹤 (Skills Verification Status)

此文件記錄所有 Skills 的驗證狀態、測試結果及架構對齐情況。

## 驗證狀態說明

- **✅ VERIFIED** - 已驗證，功能完整且測試通過
- **⚠️ PARTIAL** - 部分驗證，功能不完整或待補充測試
- **❌ UNVERIFIED** - 未驗證，尚未進行測試或待審核
- **🔄 IN-PROGRESS** - 驗證進行中

---

## Skill 驗證清單

### 1. auto-login
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ✅ 支援 Teacher 角色自動登入
  - ✅ 支援 Student 角色自動登入
  - ✅ 環境變數讀取 (TEST_TEACHER_EMAIL, TEST_STUDENT_EMAIL)
  - ✅ Bypass Secret 驗證機制
- **已知問題**: 無
- **架構對齐**: ✅ 與 YAML frontmatter 一致

### 2. student-enrollment-flow
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ✅ 自動登入整合
  - ✅ 點數餘額檢查
  - ✅ 點數購買流程 (/pricing → /pricing/checkout)
  - ✅ 課程報名流程
  - ✅ 模擬支付邏輯
- **已知問題**: 無
- **架構對齐**: ✅ 與 Core Operational Flows 對齐

### 3. student-courses-page
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ✅ 進入教室按鈕時間驗證
  - ✅ 老師欄位資料檢查
  - ✅ 課程 ID 對應邏輯
  - ✅ 資料完整性驗證
- **已知問題**: 無
- **架構對齐**: ✅ 與 Core Entities 對齐

### 4. teacher-courses-page
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ✅ 學生資訊顯示
  - ✅ 進入教室按鈕功能
  - ✅ 時間驗證邏輯
  - ✅ 剩餘課程數/時間計算
- **已知問題**: 無
- **架構對齐**: ✅ 與 Teacher Profile 對齐

### 5. course-management-service
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ✅ 教師課程建立流程
  - ✅ 課程列表顯示
  - ⚠️ 管理員審核流程 (待完整驗證)
- **已知問題**: 
  - 管理員審核頁面 (/admin/course-reviews) 待驗證完整性
- **架構對齐**: ⚠️ 部分對齐，待 schema 更新驗證

### 6. admin-teacher-management
- **狀態**: ⚠️ PARTIAL
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ✅ 教師在職狀態管理 (/teachers/manage)
  - ⚠️ 教師教學資訊審核 (待實裝驗證)
- **已知問題**: 
  - TeacherReview 實體 pending 實裝，待驗證
- **架構對齐**: ⚠️ 部分對齐，TeacherReview 架構待確認

### 7. admin-order-management
- **狀態**: 🔄 IN-PROGRESS
- **驗證日期**: 2026-04-06
- **最後更新**: 2026-04-06
- **驗證項目**:
  - ✅ 管理後台（Admin Portal）操作功能
  - ✅ 方案排序與配置 UI
  - ✅ CSV 檔案匯出
  - ✅ 退款流程連動（參考 `purchase-refund-flow`）
- **已知問題**: 
  - 部分複雜篩選邏輯（如跨表搜尋）待優化。
- **架構對齊**: ✅ 對齊完成

### 8. course-point-return (原 order-refund)
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-04-06
- **最後更新**: 2026-04-06
- **驗證項目**:
  - ✅ 學生取消課程引發的點數返還
  - ✅ Enrollment 狀態同步
  - ✅ 防止重複退點邏輯
- **已知問題**: 無
- **架構對齊**: ✅ 對齐完成

### 9. course-alignment
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-03-15
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ✅ /student_courses 對應驗證
  - ✅ /teacher_courses 對應驗證
  - ✅ 孤立訂單過濾機制
  - ✅ 訂單資料完整性檢查
- **已知問題**: 無
- **架構對齊**: ✅ 對齐完成

### 10. ai-chat
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ❌ AI 聊天室功能
  - ❌ Tool calling 整合
  - ❌ 多提供者支援 (Gemini/OpenAI)
- **已知問題**: 
  - 待 API 實裝驗證
- **架構對齊**: ❓ 待確認

### 10. payment (workflow)
- **狀態**: ❌ UNVERIFIED
- **驗證日期**: -
- **最後更新**: 2026-03-15
- **驗證項目**:
  - ❌ Payment workflow
- **已知問題**: 
  - 待詳細功能規格
- **架構對齐**: ❓ 待確認

### 12. purchase-flow-verification
- **狀態**: ✅ VERIFIED
- **驗證日期**: 2026-04-06
- **最後更新**: 2026-04-06
- **驗證項目**:
  - ✅ 點數購買 (/pricing → /pricing/checkout)
  - ✅ 方案訂購驗證 (Subscription/Bundles)
  - ✅ 模擬與真實支付模式驗證
  - ✅ 計價扣點邏輯 (pricing-deduction)
- **已知問題**: 無
- **架構對齊**: ✅ 對齊完成

### 13. purchase-refund-flow
- **狀態**: 🔄 IN-PROGRESS
- **驗證日期**: 2026-04-06
- **最後更新**: 2026-04-06
- **驗證項目**:
  - ✅ 管理員撤銷訂單業務連動
  - 🔄 點數套餐退款 (金流退回 + 點數扣除)
  - 🔄 方案退款 (Plan status Revert)
  - ✅ 串接核心技術工具 `monetary-refund`
- **已知問題**: 
  - 目前測試較多偏重在 `course-point-return` 的點數返還驗證。
- **架構對齊**: ✅ 已規劃對齊

---

## 驗證流程與更新指南

### 新建或更新 Skill 時

1. **建立/編輯 SKILL.md**：在 YAML frontmatter 中添加 `metadata` 欄位
   ```yaml
   ---
   name: skill-name
   description: '...'
   argument-hint: '...'
   metadata:
     verified-status: ✅ VERIFIED | ⚠️ PARTIAL | ❌ UNVERIFIED | 🔄 IN-PROGRESS
     last-verified-date: YYYY-MM-DD
     architecture-aligned: true | false
   ---
   ```
   
   > 注意：不支援直接在 frontmatter 中添加 `verified-status`、`last-verified-date`、`architecture-aligned` 欄位。
   > 必須使用 `metadata` 欄位進行嵌套，才能通過驗證。

2. **更新此文件**：新增或修改對應的 Skill 項目

3. **提交變更**：一併提交 SKILL.md 及此狀態文件

### 架構變動時

1. **偵測變動**：monitor `schema.graphql` 或 `architecture_overview.md` 的改動
2. **標記受影響的 Skills**：更新相關 Skill 的 `verified-status` 為 `⚠️ PARTIAL` 或 `🔄 IN-PROGRESS`
3. **驗證與同步**：執行對應 Skill 的測試並更新此文件
4. **完成標記**：恢復為 `✅ VERIFIED` 或保持其他狀態

### 驗證流程檢查清單

- [ ] 功能測試通過 (E2E 或手動)
- [ ] 依賴的架構實體已實裝
- [ ] API 端點正確且穩定
- [ ] SKILL.md 文件完整
- [ ] 無已知的 blocker issues

---

## 搜尋與過濾

- **已驗證且可用**: `✅ VERIFIED`
- **待驗證**: `❌ UNVERIFIED` / `🔄 IN-PROGRESS`
- **需要注意**: `⚠️ PARTIAL`
- **架構不同步**: `architecture-aligned: false`

---

## 維護者

- 最後更新者: AI Assistant
- 最後更新時間: 2026-03-15
