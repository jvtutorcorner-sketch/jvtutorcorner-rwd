import { ddbDocClient } from './dynamo';
import { PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { LearningQuestionnaireValues, QuestionnaireSubmission } from '@/types/questionnaire';

const TABLE = process.env.DYNAMODB_TABLE_QUESTIONNAIRES || 'jvtutorcorner-questionnaires';

export async function saveQuestionnaire(
  userId: string,
  mode: string,
  data: LearningQuestionnaireValues,
  opts?: { lineUid?: string; displayName?: string }
): Promise<QuestionnaireSubmission> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const item: QuestionnaireSubmission = {
    id,
    userId,
    lineUid: opts?.lineUid,
    displayName: opts?.displayName,
    mode,
    data,
    submittedAt: now,
    createdAt: now,
    makeComSent: false,
  };

  if (TABLE) {
    await ddbDocClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  }

  return item;
}

export async function getQuestionnaireById(id: string): Promise<QuestionnaireSubmission | null> {
  if (!TABLE) return null;
  const res = await ddbDocClient.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return (res.Item as QuestionnaireSubmission) || null;
}

export async function getQuestionnairesByUserId(userId: string): Promise<QuestionnaireSubmission[]> {
  if (!TABLE) return [];
  const res = await ddbDocClient.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'UserIdIndex',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
    ScanIndexForward: false,
  }));
  return (res.Items as QuestionnaireSubmission[]) || [];
}

export async function getQuestionnairesByLineUid(lineUid: string): Promise<QuestionnaireSubmission[]> {
  if (!TABLE) return [];
  const res = await ddbDocClient.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'LineUidIndex',
    KeyConditionExpression: 'lineUid = :lineUid',
    ExpressionAttributeValues: { ':lineUid': lineUid },
    ScanIndexForward: false,
  }));
  return (res.Items as QuestionnaireSubmission[]) || [];
}

export async function markMakeComSent(id: string): Promise<void> {
  if (!TABLE) return;
  const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  await ddbDocClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id },
    UpdateExpression: 'SET makeComSent = :true',
    ExpressionAttributeValues: { ':true': true },
  }));
}
