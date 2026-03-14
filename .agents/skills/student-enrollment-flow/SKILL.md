---
name: student-enrollment-flow
description: '自動化學生購買點數與報名課程的完整流程。包含：登入、點數餘額檢查、方案頁購買點數、隨機選擇課程報名、以及模擬支付。'
argument-hint: '執行完整報名流程測試'
---

# 學生報名流程技能 (Student Enrollment Flow Skill)

此技能自動化學生在平台上的核心操作流程，特別是針對「點數不足時自動儲值並重新報名」的邏輯驗證。

## 功能特點

1.  **自動登入**：串接 `auto-login` 邏輯，使用測試帳號並繞過驗證碼。
2.  **餘額感知**：檢查當前點數，若不足以支付目標課程，自動前往 `/pricing`。
3.  **點數購買**：在 `/pricing` 選擇點數套餐，並在 `/pricing/checkout` 使用「模擬支付」完成交易。
4.  **課程報名**：在 `/courses` 隨機挑選課程，填寫資訊並報名。
5.  **錯誤自愈**：若報名過程中遇到點數不足的 UI 報錯，自動切換至購買流程後返回。

## 使用方式

### 對於 AI 助手 (Antigravity)
當被要求執行此流程或測試相關功能時，請：
1.  **執行 Playwright 測試**：運行 `/Users/xucaiming/jvtutorcorner-rwd/e2e/student_enrollment.spec.ts`。
2.  **觀察結果**：若測試失敗（例如找不到元素或請求報錯），分析原因。
3.  **自動修正**：
    - 若為程式碼 bug，直接修正原始碼及其對應的測試。
    - 若為測試腳本過時，更新測試腳本。
4.  **回報進度**：回報最終成功狀態或無法自動修復的嚴重問題。

## 測試指令

```bash
npx playwright test e2e/student_enrollment.spec.ts
```
