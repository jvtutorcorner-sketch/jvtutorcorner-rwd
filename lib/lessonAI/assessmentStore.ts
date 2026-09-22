// lib/lessonAI/assessmentStore.ts
//
// DynamoDB access for Phase 4 AI assessments. Server-only.
//   assessments             PK sessionId, SK assessmentId
//   assessment-submissions  PK assessmentId, SK studentId (one per student)

import { randomUUID } from 'crypto';
import { PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import type { AssessmentQuestion, AnswerMap, QuestionGrade } from './assessment';

export const ASSESSMENTS_TABLE =
  process.env.DYNAMODB_TABLE_ASSESSMENTS || 'jvtutorcorner-assessments';
export const ASSESSMENT_SUBMISSIONS_TABLE =
  process.env.DYNAMODB_TABLE_ASSESSMENT_SUBMISSIONS || 'jvtutorcorner-assessment-submissions';

export type AssessmentStatus = 'draft' | 'dispatched';

export interface StoredAssessment {
  sessionId: string;
  assessmentId: string;
  courseId: string;
  teacherId: string;
  title: string;
  questions: AssessmentQuestion[];
  status: AssessmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSubmission {
  assessmentId: string;
  studentId: string;
  sessionId: string;
  courseId: string;
  answers: AnswerMap;
  grades: QuestionGrade[];
  score: number;
  maxScore: number;
  status: 'graded';
  gradedAt: string;
  createdAt: string;
}

export async function createAssessment(input: {
  sessionId: string;
  courseId: string;
  teacherId: string;
  title: string;
  questions: AssessmentQuestion[];
  status?: AssessmentStatus;
}): Promise<StoredAssessment> {
  const now = new Date().toISOString();
  const item: StoredAssessment = {
    sessionId: input.sessionId,
    assessmentId: randomUUID(),
    courseId: input.courseId,
    teacherId: input.teacherId,
    title: input.title,
    questions: input.questions,
    status: input.status || 'dispatched',
    createdAt: now,
    updatedAt: now,
  };
  await ddbDocClient.send(
    new PutCommand({
      TableName: ASSESSMENTS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(assessmentId)',
    })
  );
  return item;
}

export async function getAssessment(sessionId: string, assessmentId: string): Promise<StoredAssessment | null> {
  if (!sessionId || !assessmentId) return null;
  const res = await ddbDocClient.send(
    new GetCommand({ TableName: ASSESSMENTS_TABLE, Key: { sessionId, assessmentId } })
  );
  return (res.Item as StoredAssessment) || null;
}

export async function listAssessmentsBySession(sessionId: string): Promise<StoredAssessment[]> {
  if (!sessionId) return [];
  const items: StoredAssessment[] = [];
  let exclusiveStartKey: any = undefined;
  do {
    const res: any = await ddbDocClient.send(
      new QueryCommand({
        TableName: ASSESSMENTS_TABLE,
        KeyConditionExpression: 'sessionId = :s',
        ExpressionAttributeValues: { ':s': sessionId },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    items.push(...((res.Items || []) as StoredAssessment[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** Idempotent per (assessmentId, studentId): a re-submit overwrites the grade. */
export async function putSubmission(sub: Omit<StoredSubmission, 'createdAt'> & { createdAt?: string }): Promise<StoredSubmission> {
  const item: StoredSubmission = { ...sub, createdAt: sub.createdAt || new Date().toISOString() };
  await ddbDocClient.send(new PutCommand({ TableName: ASSESSMENT_SUBMISSIONS_TABLE, Item: item }));
  return item;
}

export async function getSubmission(assessmentId: string, studentId: string): Promise<StoredSubmission | null> {
  if (!assessmentId || !studentId) return null;
  const res = await ddbDocClient.send(
    new GetCommand({ TableName: ASSESSMENT_SUBMISSIONS_TABLE, Key: { assessmentId, studentId } })
  );
  return (res.Item as StoredSubmission) || null;
}

export async function listSubmissions(assessmentId: string): Promise<StoredSubmission[]> {
  if (!assessmentId) return [];
  const items: StoredSubmission[] = [];
  let exclusiveStartKey: any = undefined;
  do {
    const res: any = await ddbDocClient.send(
      new QueryCommand({
        TableName: ASSESSMENT_SUBMISSIONS_TABLE,
        KeyConditionExpression: 'assessmentId = :a',
        ExpressionAttributeValues: { ':a': assessmentId },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    items.push(...((res.Items || []) as StoredSubmission[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}
