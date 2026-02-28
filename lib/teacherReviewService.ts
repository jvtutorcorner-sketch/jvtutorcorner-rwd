// lib/teacherReviewService.ts
import { ddbDocClient } from './dynamo';
import { PutCommand, QueryCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const REVIEW_RECORDS_TABLE = process.env.DYNAMODB_TABLE_TEACHER_REVIEWS || 'jvtutorcorner-teacher-reviews';

/**
 * 教师资料审核记录
 */
export type TeacherReviewRecord = {
  id: string; // 审核记录 ID (UUID)
  teacherId: string; // 教师 ID
  teacherName: string; // 教师名称
  requestedAt: string; // 申请时间 (ISO 8601)
  reviewedAt: string; // 审核时间 (ISO 8601)
  reviewedBy: string; // 审核人 (admin user ID or email)
  action: 'approve' | 'reject'; // 审核结果
  originalData: Record<string, any>; // 原始数据快照
  requestedChanges: Record<string, any>; // 请求的变更内容
  notes?: string; // 审核备注
  createdAt: string; // 记录创建时间
};

/**
 * 创建审核记录
 */
export async function createReviewRecord(
  record: Omit<TeacherReviewRecord, 'id' | 'createdAt'>
): Promise<TeacherReviewRecord> {
  if (!REVIEW_RECORDS_TABLE) {
    throw new Error('DYNAMODB_TABLE_TEACHER_REVIEWS not configured');
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const fullRecord: TeacherReviewRecord = {
    ...record,
    id,
    createdAt,
  };

  try {
    const command = new PutCommand({
      TableName: REVIEW_RECORDS_TABLE,
      Item: fullRecord,
    });

    await ddbDocClient.send(command);
    console.log('[teacherReviewService] Review record created:', id);
    return fullRecord;
  } catch (error) {
    console.error('[teacherReviewService] Failed to create review record:', error);
    throw error;
  }
}

/**
 * 根据教师 ID 查询所有审核记录
 */
export async function getReviewRecordsByTeacherId(teacherId: string): Promise<TeacherReviewRecord[]> {
  if (!REVIEW_RECORDS_TABLE) {
    throw new Error('DYNAMODB_TABLE_TEACHER_REVIEWS not configured');
  }

  try {
    // 如果有 GSI (Global Secondary Index) 可以使用 Query，否则使用 Scan + filter
    const command = new ScanCommand({
      TableName: REVIEW_RECORDS_TABLE,
      FilterExpression: 'teacherId = :teacherId',
      ExpressionAttributeValues: {
        ':teacherId': teacherId,
      },
    });

    const response = await ddbDocClient.send(command);
    return (response.Items || []) as TeacherReviewRecord[];
  } catch (error) {
    console.error('[teacherReviewService] Failed to get review records:', error);
    throw error;
  }
}

/**
 * 获取所有审核记录（支持分页）
 */
export async function getAllReviewRecords(
  limit?: number,
  lastEvaluatedKey?: Record<string, any>
): Promise<{ records: TeacherReviewRecord[]; lastEvaluatedKey?: Record<string, any> }> {
  if (!REVIEW_RECORDS_TABLE) {
    throw new Error('DYNAMODB_TABLE_TEACHER_REVIEWS not configured');
  }

  try {
    const command = new ScanCommand({
      TableName: REVIEW_RECORDS_TABLE,
      Limit: limit,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const response = await ddbDocClient.send(command);
    return {
      records: (response.Items || []) as TeacherReviewRecord[],
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  } catch (error) {
    console.error('[teacherReviewService] Failed to get all review records:', error);
    throw error;
  }
}

/**
 * 根据 ID 获取单条审核记录
 */
export async function getReviewRecordById(id: string): Promise<TeacherReviewRecord | null> {
  if (!REVIEW_RECORDS_TABLE) {
    throw new Error('DYNAMODB_TABLE_TEACHER_REVIEWS not configured');
  }

  try {
    const command = new GetCommand({
      TableName: REVIEW_RECORDS_TABLE,
      Key: { id },
    });

    const response = await ddbDocClient.send(command);
    return response.Item ? (response.Item as TeacherReviewRecord) : null;
  } catch (error) {
    console.error('[teacherReviewService] Failed to get review record:', error);
    throw error;
  }
}

/**
 * 获取最近的审核记录（按 reviewedAt 降序）
 */
export async function getRecentReviewRecords(limit: number = 20): Promise<TeacherReviewRecord[]> {
  if (!REVIEW_RECORDS_TABLE) {
    throw new Error('DYNAMODB_TABLE_TEACHER_REVIEWS not configured');
  }

  try {
    const command = new ScanCommand({
      TableName: REVIEW_RECORDS_TABLE,
      Limit: limit * 2, // 获取更多数据用于排序
    });

    const response = await ddbDocClient.send(command);
    const records = (response.Items || []) as TeacherReviewRecord[];

    // 按 reviewedAt 降序排序
    records.sort((a, b) => {
      return new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime();
    });

    return records.slice(0, limit);
  } catch (error) {
    console.error('[teacherReviewService] Failed to get recent review records:', error);
    throw error;
  }
}

/**
 * 获取审核统计信息
 */
export async function getReviewStats(): Promise<{
  total: number;
  approved: number;
  rejected: number;
}> {
  if (!REVIEW_RECORDS_TABLE) {
    throw new Error('DYNAMODB_TABLE_TEACHER_REVIEWS not configured');
  }

  try {
    const command = new ScanCommand({
      TableName: REVIEW_RECORDS_TABLE,
    });

    const response = await ddbDocClient.send(command);
    const records = (response.Items || []) as TeacherReviewRecord[];

    return {
      total: records.length,
      approved: records.filter(r => r.action === 'approve').length,
      rejected: records.filter(r => r.action === 'reject').length,
    };
  } catch (error) {
    console.error('[teacherReviewService] Failed to get review stats:', error);
    throw error;
  }
}
