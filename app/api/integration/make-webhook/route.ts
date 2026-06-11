import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getMakeConfig } from '@/lib/integration/makeRuntimeConfig';
import { getQuestionnaireById } from '@/lib/questionnaireService';
import { ddbDocClient } from '@/lib/dynamo';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

const QUESTIONNAIRES_TABLE = process.env.DYNAMODB_TABLE_QUESTIONNAIRES || 'jvtutorcorner-questionnaires';

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-make-signature');

  const config = await getMakeConfig();

  // Verify HMAC signature only if a secret is configured
  if (config.webhookSecret) {
    const valid = await verifySignature(rawBody, signature, config.webhookSecret);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { eventType, data } = payload;

  try {
    switch (eventType) {
      case 'TEACHER_RECOMMENDED': {
        // Make.com sends back teacher recommendations for a questionnaire submission
        const { submissionId, teachers } = data || {};
        if (submissionId && QUESTIONNAIRES_TABLE) {
          await ddbDocClient.send(new UpdateCommand({
            TableName: QUESTIONNAIRES_TABLE,
            Key: { id: submissionId },
            UpdateExpression: 'SET recommendedTeachers = :teachers, updatedAt = :now',
            ExpressionAttributeValues: {
              ':teachers': teachers || [],
              ':now': new Date().toISOString(),
            },
          }));
        }
        break;
      }

      case 'QUESTIONNAIRE_FOLLOWUP': {
        // Record follow-up actions without additional processing
        console.log('[make-webhook] QUESTIONNAIRE_FOLLOWUP received', data?.submissionId);
        break;
      }

      default:
        console.log('[make-webhook] Unhandled event type stored for audit:', eventType);
    }
  } catch (e: any) {
    console.error('[make-webhook] Error processing event', eventType, e?.message || e);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, eventType });
}
