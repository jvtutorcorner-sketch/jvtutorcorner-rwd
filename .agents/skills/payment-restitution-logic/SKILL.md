---
name: payment-restitution-logic
description: '負責處理課程取消後的點數返還（Point Return）邏輯，將已消耗的點數加回學生帳戶。'
argument-hint: '實作或更新點數返還/扣點回補邏輯'
metadata:
  verified-status: '🏗️ IN PROGRESS'
  last-verified-date: '2026-04-06'
  architecture-aligned: true
---

# 點數資產歸還邏輯技能 (Payment Restitution Logic Skill)

> [!NOTE]
> 此技能專注於「學生端取消課程」後的資產退回流程，不涉及真實金錢（Monetary）的金流退款。

此技能負責處理學生的「點數回補」流程。當課程被取消或因故需退點時，確保點數精準、即時地返還至學生的 `userPoints` 資產中。

## 職責定義 (Scope)
- **場景**：專用於 Enrollment（報名紀錄）的取消。
- **目標**：原路退回「點數」，撤銷課程權限。
- **與 `payment-refund-orchestration` 的區別**：本技能處理的是「把點數還給學生」；而 `payment-refund-orchestration` 處理的是「從學生身上把點數抽回來（退錢）」。

## 點數返還核心流程

1.  **觸發條件**：
    - 管理員在訂單管理頁面針對單一課程報名（Enrollment）點擊「點數退回」。
    - 系統自動取消流程（如教師未出席、系統錯誤）觸發的補償。
2.  **餘額校閱 (Reconciliation)**：
    - 讀取該筆報名記錄 (`Enrollment`) 或訂單 (`Order`) 中的 `pointsUsed`。
3.  **異動寫入**：
    - 呼叫 `lib/pointsStorage.ts` 的 `setUserPoints` 執行。
    - 確保併發更新的安全（Atomic update）。
4.  **狀態同步**：
    - 更新 `Enrollment` 狀態為 `CANCELLED` 或 `POINT_RETURNED`。
5.  **日誌記錄 (Points Ledger)**：
    - 新增一筆 `action: "RETURN"` 的點數歷史記錄。

## 相關檔案
- `lib/pointsStorage.ts`: 點數儲存核心邏輯。
- `app/api/orders/[orderId]/route.ts`: 處理訂單狀態變更與觸發退點的端點。

## 測試指令
```bash
# 驗證課程取消點數返還
npx playwright test e2e/order_refund.spec.ts
```
