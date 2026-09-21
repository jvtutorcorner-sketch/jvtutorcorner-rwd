// lib/email/checkinTicketTrigger.ts
// Shared by both order-write call sites (POST /api/orders, PATCH /api/orders/[orderId])
// so the "send once when an order first becomes PAID" logic lives in one place.

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { getProfileById } from '@/lib/profilesService';
import { sendCheckinTicketEmail } from '@/lib/email/checkinTicketService';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';

/**
 * 寄送報到票券信並標記 ticketEmailSentAt（冪等，避免重複觸發時重寄）。
 * Fire-and-forget：呼叫端不應 await 這個 function 阻擋回應。
 */
export async function triggerCheckinTicketEmail(order: any): Promise<void> {
  if (!order?.orderId || !order?.userId || order.ticketEmailSentAt) return;

  const profile = await getProfileById(order.userId).catch(() => null);
  const email = profile?.email;
  if (!email) {
    console.warn(`[triggerCheckinTicketEmail] No email found for userId ${order.userId}, skipping`);
    return;
  }

  let teacherName = '';
  try {
    if (order.courseId) {
      const cRes = await ddbDocClient.send(new GetCommand({ TableName: COURSES_TABLE, Key: { id: order.courseId } }));
      teacherName = cRes.Item?.teacherName || '';
    }
  } catch {
    // best-effort — missing teacher name shouldn't block the email
  }

  const sent = await sendCheckinTicketEmail(email, order.orderId, order.courseTitle, teacherName, order.startTime || '');
  if (sent) {
    await ddbDocClient.send(new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId: order.orderId },
      UpdateExpression: 'SET ticketEmailSentAt = :now',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
    }));
  }
}
