import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { COURSES as BUNDLED_COURSES } from '@/data/courses';
import { PutCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

async function readCourses(): Promise<any[]> {
  try {
    const DATA_FILE = await resolveDataFile('courses.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    // If local file is empty, return empty array (we handle merge later)
    return parsed;
  } catch (err) {
    return [];
  }
}

async function writeCourses(arr: any[]) {
  try {
    const DATA_FILE = await resolveDataFile('courses.json');
    await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.warn('[courses API] failed to write courses', (err as any)?.message || err);
  }
}

// Helper to get all effective courses (Local or Bundled fallback)
// Returns [coursesArray, isFromBundle]
async function getEffectiveCourses(): Promise<[any[], boolean]> {
  let courses = await readCourses();
  let isFromBundle = false;
  if ((!courses || courses.length === 0) && Array.isArray(BUNDLED_COURSES) && BUNDLED_COURSES.length > 0) {
    courses = [...(BUNDLED_COURSES as any[])]; // distinct copy
    isFromBundle = true;
  }
  return [courses, isFromBundle];
}

export async function DELETE(req: Request, { params }: { params: any }) {
  try {
    const { id } = await params;

    // Check for DynamoDB support
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
    const hasCreds = !!(process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) && !!(process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
    const useDynamo = typeof COURSES_TABLE === 'string' && COURSES_TABLE.length > 0 && (process.env.NODE_ENV === 'production' || hasCreds);

    if (useDynamo) {
      try {
        const deleteCmd = new DeleteCommand({ TableName: COURSES_TABLE, Key: { id } });
        await ddbDocClient.send(deleteCmd);
        return NextResponse.json({ ok: true, message: 'Deleted' });
      } catch (err: any) {
        console.error('[courses DELETE DynamoDB] error', err?.message || err);
        // Fall back to local file handling
      }
    }

    // Fallback to local file handling
    // Load effective courses (merging bundled if local is empty)
    const [courses] = await getEffectiveCourses();

    // Normalize ID lookup
    let idx = courses.findIndex((c) => String(c.id) === String(id));
    if (idx === -1) {
      try {
        const dec = decodeURIComponent(id);
        idx = courses.findIndex((c) => String(c.id) === String(dec));
      } catch (e) { }
    }

    if (idx === -1) return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
    courses.splice(idx, 1);
    await writeCourses(courses);
    return NextResponse.json({ ok: true, message: 'Deleted' });
  } catch (err: any) {
    console.error('[courses DELETE] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to delete course' }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: any }) {
  try {
    const { id } = await params;

    // Check for DynamoDB support
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
    const hasCreds = !!(process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) && !!(process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID);
    const useDynamo = typeof COURSES_TABLE === 'string' && COURSES_TABLE.length > 0 && (process.env.NODE_ENV === 'production' || hasCreds);

    if (useDynamo) {
      try {
        const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id } });
        const res = await ddbDocClient.send(getCmd);
        if (!res || !res.Item) return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
        return NextResponse.json({ ok: true, course: res.Item });
      } catch (err: any) {
        console.error('[courses GET by id DynamoDB] error', err?.message || err);
        // Fall back to local file handling
      }
    }

    // Fallback to local file handling
    const [courses] = await getEffectiveCourses();

    let c = courses.find((x) => String(x.id) === String(id));
    if (!c) {
      try {
        const dec = decodeURIComponent(id);
        c = courses.find((x) => String(x.id) === String(dec));
      } catch (e) { }
    }

    if (!c) return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
    return NextResponse.json({ ok: true, course: c });
  } catch (err: any) {
    console.error('[courses GET by id] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read course' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: any }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Check for DynamoDB support
    const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
    const ddbRegion = process.env.CI_AWS_REGION || process.env.AWS_REGION;
    const hasCreds = !!(process.env.CI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) && !!(process.env.CI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY);
    const useDynamo = typeof COURSES_TABLE === 'string' && COURSES_TABLE.length > 0 && (process.env.NODE_ENV === 'production' || hasCreds);

    if (useDynamo) {
      try {
        // Build update expression for DynamoDB
        const updateExpressionParts: string[] = [];
        const expressionAttributeNames: any = {};
        const expressionAttributeValues: any = {};

        if (body.title !== undefined) {
          updateExpressionParts.push('#title = :title');
          expressionAttributeNames['#title'] = 'title';
          expressionAttributeValues[':title'] = body.title;
        }
        if (body.nextStartDate !== undefined) {
          updateExpressionParts.push('nextStartDate = :nextStartDate');
          expressionAttributeValues[':nextStartDate'] = body.nextStartDate;
        }
        if (body.endDate !== undefined) {
          updateExpressionParts.push('endDate = :endDate');
          expressionAttributeValues[':endDate'] = body.endDate;
        }
        if (body.durationMinutes !== undefined) {
          updateExpressionParts.push('durationMinutes = :durationMinutes');
          expressionAttributeValues[':durationMinutes'] = body.durationMinutes;
        }
        if (body.totalSessions !== undefined) {
          updateExpressionParts.push('totalSessions = :totalSessions');
          expressionAttributeValues[':totalSessions'] = body.totalSessions;
        }
        if (body.seatsLeft !== undefined) {
          updateExpressionParts.push('seatsLeft = :seatsLeft');
          expressionAttributeValues[':seatsLeft'] = body.seatsLeft;
        }
        if (body.pricePerSession !== undefined) {
          updateExpressionParts.push('pricePerSession = :pricePerSession');
          expressionAttributeValues[':pricePerSession'] = body.pricePerSession;
        }
        if (body.membershipPlan !== undefined) {
          updateExpressionParts.push('membershipPlan = :membershipPlan');
          expressionAttributeValues[':membershipPlan'] = body.membershipPlan;
        }
        if (body.description !== undefined) {
          updateExpressionParts.push('description = :description');
          expressionAttributeValues[':description'] = body.description;
        }
        if (body.teacherName !== undefined) {
          updateExpressionParts.push('teacherName = :teacherName');
          expressionAttributeValues[':teacherName'] = body.teacherName;
        }
        if (body.teacherId !== undefined) {
          updateExpressionParts.push('teacherId = :teacherId');
          expressionAttributeValues[':teacherId'] = body.teacherId;
        }
        if (body.status !== undefined) {
          updateExpressionParts.push('#status = :status');
          expressionAttributeNames['#status'] = 'status';
          expressionAttributeValues[':status'] = body.status;
        }

        // Always update updatedAt
        updateExpressionParts.push('updatedAt = :updatedAt');
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();

        const updateExpression = 'SET ' + updateExpressionParts.join(', ');

        const updateCmd = new UpdateCommand({
          TableName: COURSES_TABLE,
          Key: { id },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        });

        const result = await ddbDocClient.send(updateCmd);
        return NextResponse.json({ ok: true, course: result.Attributes });
      } catch (err: any) {
        console.error('[courses PATCH DynamoDB] error', err?.message || err);
        // Fall back to local file handling
      }
    }

    // Fallback to local file handling
    const [courses] = await getEffectiveCourses();

    let idx = courses.findIndex((c) => String(c.id) === String(id));
    if (idx === -1) {
      try {
        const dec = decodeURIComponent(id);
        idx = courses.findIndex((c) => String(c.id) === String(dec));
      } catch (e) { }
    }

    if (idx === -1) {
      return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
    }
    const course = courses[idx];
    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.nextStartDate !== undefined) updates.nextStartDate = body.nextStartDate;
    if (body.endDate !== undefined) updates.endDate = body.endDate;
    if (body.durationMinutes !== undefined) updates.durationMinutes = body.durationMinutes;
    if (body.totalSessions !== undefined) updates.totalSessions = body.totalSessions;
    if (body.seatsLeft !== undefined) updates.seatsLeft = body.seatsLeft;
    if (body.pricePerSession !== undefined) updates.pricePerSession = body.pricePerSession;
    if (body.membershipPlan !== undefined) updates.membershipPlan = body.membershipPlan;
    if (body.description !== undefined) updates.description = body.description;
    if (body.teacherName !== undefined) updates.teacherName = body.teacherName;
    if (body.teacherId !== undefined) updates.teacherId = body.teacherId;
    if (body.status !== undefined) updates.status = body.status;

    const now = new Date().toISOString();
    const merged = { ...course, ...updates, updatedAt: now };
    courses[idx] = merged;
    await writeCourses(courses);
    return NextResponse.json({ ok: true, course: merged });
  } catch (err: any) {
    console.error('[courses PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to patch course' }, { status: 500 });
  }
}

