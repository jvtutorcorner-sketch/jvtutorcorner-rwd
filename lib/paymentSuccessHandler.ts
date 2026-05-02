/**
 * Payment Success Handler
 * 統一處理所有支付方式的成功邏輯
 * 
 * 主要功能:
 * 1. 獲取訂單詳情
 * 2. 檢查訂單類型 (POINTS / PLAN)
 * 3. 如果是 POINTS，添加點數到用戶帳戶
 * 4. 記錄支付交易
 */

import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserPoints, setUserPoints } from '@/lib/pointsStorage';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const UPGRADES_TABLE = process.env.DYNAMODB_TABLE_PLAN_UPGRADES || 'jvtutorcorner-plan-upgrades';
const ENROLLMENTS_TABLE = process.env.ENROLLMENTS_TABLE || process.env.DYNAMODB_TABLE_ENROLLMENTS || 'jvtutorcorner-enrollments';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

export interface PaymentSuccessHandlerParams {
  orderId: string;
  paymentMethod: string;
  transactionId?: string;
  amount?: number;
}

export interface PaymentSuccessResult {
  ok: boolean;
  error?: string;
  pointsAdded?: number;
}

/**
 * 處理支付成功邏輯
 * 
 * @param params - 支付參數
 * @returns 處理結果
 */
export async function handlePaymentSuccess(
  params: PaymentSuccessHandlerParams
): Promise<PaymentSuccessResult> {
  try {
    const { orderId, paymentMethod, transactionId, amount } = params;

    console.log(`[Payment Success Handler] Processing orderId: ${orderId}, method: ${paymentMethod}`);

    // Step 1: 從 upgrades table 獲取訂單 (用於點數購買)
    let orderItem: any = null;
    let isUpgrade = false;

    try {
      const getCmd = new GetCommand({
        TableName: UPGRADES_TABLE,
        Key: { upgradeId: orderId },
      });
      const res = await ddbDocClient.send(getCmd);
      if (res.Item) {
        orderItem = res.Item;
        isUpgrade = true;
        console.log(`[Payment Success Handler] Found upgrade order: ${orderId}`);
      }
    } catch (err) {
      console.warn(`[Payment Success Handler] Failed to query upgrades table:`, err);
    }

    // Step 2: 如果未找到，嘗試從 orders table (課程報名)
    if (!orderItem) {
      try {
        const getCmd = new GetCommand({
          TableName: ORDERS_TABLE,
          Key: { orderId },
        });
        const res = await ddbDocClient.send(getCmd);
        if (res.Item) {
          orderItem = res.Item;
          console.log(`[Payment Success Handler] Found regular order: ${orderId}`);
        }
      } catch (err) {
        console.error(`[Payment Success Handler] Failed to query orders table:`, err);
      }
    }

    if (!orderItem) {
      const err = `Order not found: ${orderId}`;
      console.error(`[Payment Success Handler] ${err}`);
      return { ok: false, error: err };
    }

    // Step 3: 判斷訂單類型
    const itemType = orderItem.itemType || (isUpgrade ? 'POINTS' : 'COURSE');
    const userId = orderItem.userId;
    const pointsAmount = orderItem.points || 0;
    const enrollmentId = orderItem.enrollmentId;

    console.log(`[Payment Success Handler] Item type: ${itemType}, User: ${userId}, Points: ${pointsAmount}, Enrollment: ${enrollmentId}`);

    // Early exit if already completed to prevent double point addition / duplicate API updates
    const currentStatus = (orderItem.status || 'PAID').toUpperCase();
    if (currentStatus === 'COMPLETED') {
      console.log(`[Payment Success Handler] Order ${orderId} is already COMPLETED. Exiting to maintain idempotency.`);
      return { ok: true, pointsAdded: 0 };
    }

    // Step 4: 根據類型處理 (點數購買 vs 課程報名 vs 方案升級)
    let pointsAdded = 0;
    
    // 如果有附帶 App 方案，在此啟用
    if (orderItem.appPlanIds && Array.isArray(orderItem.appPlanIds) && orderItem.appPlanIds.length > 0) {
      try {
        const getProfileRes = await ddbDocClient.send(new GetCommand({
          TableName: PROFILES_TABLE,
          Key: { id: userId },
        }));
        let profile = getProfileRes.Item;
        
        if (profile) {
          const existingPlans = Array.isArray(profile.activeAppPlanIds) ? profile.activeAppPlanIds : [];
          const newPlansSet = new Set([...existingPlans, ...orderItem.appPlanIds]);
          const finalPlans = Array.from(newPlansSet);

          await ddbDocClient.send(new UpdateCommand({
            TableName: PROFILES_TABLE,
            Key: { id: profile.id },
            UpdateExpression: 'SET activeAppPlanIds = :plans, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':plans': finalPlans,
              ':updatedAt': new Date().toISOString(),
            },
          }));
          console.log(`[Payment Success Handler] Activated app plans for ${userId}:`, orderItem.appPlanIds);
        }
      } catch (err: any) {
        console.error(`[Payment Success Handler] Failed to activate app plans:`, err?.message || err);
      }
    }

    if (itemType === 'POINTS' && pointsAmount > 0) {
      try {
        // 🟢 直接調用庫函數，避免認證問題
        const currentPoints = await getUserPoints(userId);
        const newBalance = currentPoints + pointsAmount;
        
        await setUserPoints(userId, newBalance);
        pointsAdded = pointsAmount;
        
        console.log(`[Payment Success Handler] Successfully added ${pointsAdded} points to ${userId} (${currentPoints} -> ${newBalance})`);
      } catch (err: any) {
        const errMsg = `Error adding points: ${err.message}`;
        console.error(`[Payment Success Handler] ${errMsg}`, err);
        return { ok: false, error: errMsg };
      }
    } else if (itemType === 'PLAN' && orderItem.planId) {
      try {
        await ddbDocClient.send(new UpdateCommand({
          TableName: PROFILES_TABLE,
          Key: { id: userId },
          UpdateExpression: 'SET #plan = :planId, updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#plan': 'plan' },
          ExpressionAttributeValues: {
            ':planId': orderItem.planId,
            ':updatedAt': new Date().toISOString(),
          },
        }));
        console.log(`[Payment Success Handler] Updated profile plan for ${userId} → ${orderItem.planId}`);
      } catch (err: any) {
        console.error(`[Payment Success Handler] Failed to update profile plan:`, err?.message || err);
      }
    } else if ((itemType === 'COURSE' || itemType === 'course') && enrollmentId) {
      try {
        console.log(`[Payment Success Handler] Activating enrollment ${enrollmentId} for order ${orderId}`);
        const enrollUpdateCmd = new UpdateCommand({
          TableName: ENROLLMENTS_TABLE,
          Key: { id: enrollmentId },
          UpdateExpression: 'SET #st = :s, paymentProvider = :pp, paymentSessionId = :psi, updatedAt = :u',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':s': 'ACTIVE',
            ':pp': paymentMethod,
            ':psi': transactionId || orderId,
            ':u': new Date().toISOString()
          }
        });
        await ddbDocClient.send(enrollUpdateCmd);
        console.log(`[Payment Success Handler] Successfully activated enrollment ${enrollmentId}`);
      } catch (enrollErr: any) {
        console.error(`[Payment Success Handler] Failed to activate enrollment ${enrollmentId}:`, enrollErr);
        // We will continue to mark order as COMPLETED anyway to not block the flow
      }
    }

    // Step 5: 標記訂單為 COMPLETED (如果還未完成)
    try {
      const currentStatus = (orderItem.status || 'PAID').toUpperCase();
      
      if (currentStatus !== 'COMPLETED') {
        const updateCmd = new UpdateCommand({
          TableName: isUpgrade ? UPGRADES_TABLE : ORDERS_TABLE,
          Key: isUpgrade ? { upgradeId: orderId } : { orderId },
          UpdateExpression: 'SET #st = :s, updatedAt = :u',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':s': 'COMPLETED',
            ':u': new Date().toISOString(),
          },
        });

        await ddbDocClient.send(updateCmd);
        console.log(`[Payment Success Handler] Updated order ${orderId} status to COMPLETED`);
      }
    } catch (err) {
      console.error(`[Payment Success Handler] Failed to update order status:`, err);
      // 不返回失敗，因為點數已添加，只是狀態沒更新
    }

    console.log(`[Payment Success Handler] ✅ Payment processed successfully. Points added: ${pointsAdded}`);
    return {
      ok: true,
      pointsAdded,
    };
  } catch (error: any) {
    const err = `Unexpected error in payment success handler: ${error.message}`;
    console.error(`[Payment Success Handler] ${err}`, error);
    return { ok: false, error: err };
  }
}

/**
 * 驗證支付方法是否有效
 */
export function isValidPaymentMethod(method: string): boolean {
  const validMethods = ['linepay', 'ecpay', 'stripe', 'paypal', 'points'];
  return validMethods.includes(method?.toLowerCase() || '');
}
