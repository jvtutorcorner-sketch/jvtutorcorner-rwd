---
name: payment-refund-orchestration
description: '負責驗證點數與方案（訂閱/組合包）購買後的退款流程：使用者申請 → 管理員核准/駁回 → 資產反轉（點數 escrow 退回、購買點數扣回、撤銷報名）與狀態同步；金流退款為人工處理。'
argument-hint: '執行退款申請/核准流程驗證 (使用者申請 vs 管理員核准 vs 資產反轉)'
metadata:
  verified-status: '⚠️ PARTIAL'
  last-verified-date: '2026-09-17'
  architecture-aligned: true
  notes: '2026-09-17 關閉自助退款漏洞：一般使用者只能申請（refundStatus=REQUESTED），只有 admin/system 能讓訂單變 REFUNDED。授權純函式已離線驗證（scripts/verify-refund-authz.mjs）；e2e/order_refund.spec.ts 已更新但尚未實跑。方案訂單與 plan-upgrades 表的退款尚未自動化。'
---

# 點數與方案退款編排技能 (Payment Refund Orchestration Skill)

> [!IMPORTANT]
> 此技能為「核心業務流程」 (Core Business Flow)。退款必須同時確保資金回退與資產清理（防止套利）。
> **只有管理員能執行退款；使用者只能送出申請。金流實際退款一律人工處理**（見 [payment-refund-gateway](../payment-refund-gateway/SKILL.md)）。

## 流程

```
使用者 /refunds
  └─ PATCH /api/orders/[orderId] { action: 'request_refund', reason }
       · 只限訂單擁有者、status ∈ PAID/COMPLETED、沒有進行中的申請
       · 套用 24h 風險控管（第 2 次警告、第 3 次鎖定 24 小時）
       · 只寫 refundStatus=REQUESTED / refundReason / refundRequestedAt，不動 status 與資產
管理員 /admin/refunds
  ├─ POST /api/admin/refunds { orderId, action: 'approve', note?, manualGatewayRefundRef?, assetsHandledManually? }
  │    1. 條件更新搶佔：refundStatus=PROCESSING（status 仍須是 PAID/COMPLETED；PROCESSING 超過 5 分鐘可重搶）
  │    2. 資產反轉（refundAssetsReversedAt 已存在則跳過，避免重試重複處理）
  │    3. 條件更新：status=REFUNDED、refundStatus=APPROVED、refundedAt/By、gatewayRefund（非點數付款）
  │    4. HMAC PATCH /api/enroll 撤銷報名（CANCELLED）
  │    5. audit log：order.refund.approve
  ├─ POST ... { action: 'reject', note? }        → refundStatus=REJECTED（只限 REQUESTED / MANUAL_REVIEW）
  └─ POST ... { action: 'gateway_ref', manualGatewayRefundRef } → 回填金流退款編號
```

管理員也可以沿用舊介面 `PATCH /api/orders/[orderId] { status: 'REFUNDED' }`（OrdersManager / admin 訂單詳情頁），內部同樣呼叫 `approveRefund`。

## 資產反轉規則（`planAssetReversal`）

| 訂單 | 反轉動作 | 無法完成時 |
| --- | --- | --- |
| `paymentMethod='points'` 且有 `pointsEscrowId` | `refundEscrow` 退回學生；escrow 早已 REFUNDED 視為完成 | escrow 已 RELEASED（已撥給老師）→ MANUAL_REVIEW |
| `paymentMethod='points'` 但沒有 escrowId（舊資料） | 先 `getEscrowByOrder`，找不到才 `addUserPoints` | — |
| `itemType='POINTS'`（金流購買點數套餐） | 條件更新 `balance >= points` 扣回購買的點數 | 餘額不足 → MANUAL_REVIEW，不變更任何資產 |
| `itemType='PLAN'` | 不自動處理（原方案未記錄） | 一律 MANUAL_REVIEW；人工降級後勾選「資產已人工處理」再核准 |
| 其他（金流付款課程） | 只撤銷報名 | — |

MANUAL_REVIEW 時訂單維持 PAID/COMPLETED，`refundManualReviewReason` 記錄原因，audit log `order.refund.manual_review`。

## 授權（`decideOrderPatch`，純函式）

- **admin / system**（system = 金流 webhook HMAC、非 production 的 x-e2e-secret）：`REFUNDED` 走 `approveRefund`；其餘狀態沿用整筆更新（已 REFUNDED 的訂單不可再改）。
- **訂單擁有者**：只能 `request_refund`、取消**未付款**訂單（PENDING/PENDING_PAYMENT/CREATED/UNPAID/FAILED）、同步 `remainingSeconds`。
- **課程老師**（`canManageCourse` 比對課程 teacherId）：只能同步 `remainingSeconds` 與 `action: 'deduct'`。
- 非管理員不可附加 `payment(s)`、不可設 PAID/REFUNDED/COMPLETED，body 出現白名單以外的 key（`action`/`status`/`remainingSeconds`/`reason`）一律 400。

## 相關檔案
- `app/api/orders/[orderId]/route.ts`：PATCH 授權、退款申請、取消、教室時間同步、風險控管。
- `app/api/admin/refunds/route.ts`：管理員 GET 列表 / POST 核准、駁回、回填編號（`withAdmin`）。
- `app/api/admin/refunds/refundService.ts`：`approveRefund` / `rejectRefund` / `setGatewayRefundReference` / `listRefundOrders`。
- `app/api/admin/refunds/refundPolicy.ts`：授權與資產反轉計畫的純函式。
- `app/refunds/`：使用者退款申請與紀錄（`layout.tsx` 要求登入）。
- `app/admin/refunds/page.tsx`：管理員審核介面。
- `lib/pointsEscrow.ts`：`refundEscrow`（交易式、併發安全）。

## 相關組合技能
- **`payment-refund-gateway`**：金流端人工退款與 `gatewayRefund` 紀錄格式。
- **`payment-restitution-logic`**：課程取消（Enrollment）的點數返還。
- **`points-escrow`**：點數暫存的釋放/退回。

## 測試指令
```bash
# 離線：授權 / 欄位白名單 / 資產反轉計畫（不碰資料庫）
node --import ./scripts/lib/register-ts-resolve.mjs scripts/verify-refund-authz.mjs

# E2E（需本機環境，勿對 production 執行）：使用者自助退款被拒 → 申請 → 管理員核准 → 點數退回 + 報名取消 + 重複核准冪等
npx playwright test e2e/order_refund.spec.ts
```

## 已知缺口
- `jvtutorcorner-plan-upgrades` 表（點數套餐/方案購買的主要來源）尚未接上退款流程，目前只處理 orders 表。
- `/api/admin/refunds` GET 為整表 scan + filter，訂單量大時需要 refundStatus GSI。
