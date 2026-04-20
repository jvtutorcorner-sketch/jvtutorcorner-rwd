---
name: payment-refund-orchestration
description: '負責驗證點數與方案（訂閱/組合包）購買後的退款驗證，包含金流原路退回、資產扣除與狀態同步。'
argument-hint: '執行點數或方案退款驗證 (金流 vs 點數扣除)'
metadata:
  verified-status: '🏗️ IN PROGRESS'
  last-verified-date: '2026-04-06'
  architecture-aligned: true
---

# 點數與方案退款編排技能 (Payment Refund Orchestration Skill)

> [!IMPORTANT]
> 此技能為「核心業務流程」 (Core Business Flow)，處理管理者撤銷訂單後的資產正確性。

此技能負責處理「購買行為」的逆向操作驗證。退款必須同時確保資金回退與資產清理（防止套利）。

## 退款核心邏輯與聯動層次

1.  **金流回退 (呼叫 `payment-refund-gateway`)**：
    - 根據訂單的 `paymentMethod` (stripe/paypal) 使用 **`payment-refund-gateway`** 的技術工具執行金流退還。
2.  **資產扣除 (關鍵業務)**：
    - **點數退款**：從學員點數餘額扣回退款套餐所含的點數（例如退回 100 點套餐，餘額減少 100 點）。
    - **方案退款**：撤銷學員目前的訂閱等級 (Plan) 權限至原始等級。
3.  **防弊機制**：
    - 驗證用戶點數餘額是否足以扣回點數（若點數已花完，應發送異常警示，停止自動金流退款轉為人工審查）。
    - 觸發 24 小時退款限制檢查 (見 `app/api/orders/[orderId]/route.ts`)。

## 相關組合技能
- **`payment-refund-gateway`**：提供金流 API 呼叫的技術支持。
- **`point-restitution-flow`**：處理「課程報名 (Enrollment)」的取消與點數退回；與本技能處理的「購買行為產生的資產扣除」方向相反。

## 測試指令
```bash
# 驗證報名課程退款 (點數返還)
npx playwright test e2e/order_refund.spec.ts

# 預期開發：驗證金流退錢 + 資產回扣
# npx playwright test e2e/purchase_money_refund.spec.ts
```
