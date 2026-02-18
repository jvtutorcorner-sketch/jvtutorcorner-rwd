import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { COURSES as BUNDLED_COURSES } from '@/data/courses';
import { PutCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';

const COURSES_TABLE = process.env.DYNAMODB_TABLE_COURSES || 'jvtutorcorner-courses';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

export async function DELETE(req: Request, { params }: { params: any }) {
  try {
    const { id } = await params;

    const deleteCmd = new DeleteCommand({ TableName: COURSES_TABLE, Key: { id } });
    await ddbDocClient.send(deleteCmd);
    return NextResponse.json({ ok: true, message: 'Deleted' });
  } catch (err: any) {
    console.error('[courses DELETE] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to delete course' }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: any }) {
  try {
    const { id } = await params;

    const getCmd = new GetCommand({ TableName: COURSES_TABLE, Key: { id } });
    const res = await ddbDocClient.send(getCmd);
    let item = res && res.Item ? res.Item : null;

    if (!item) {
      // Fallback to bundled sample data
      if (Array.isArray(BUNDLED_COURSES)) {
        const idNorm = String(id).trim();
        item = (BUNDLED_COURSES as any[]).find((x) => String(x.id) === idNorm);
        if (!item) {
          try {
            const dec = decodeURIComponent(id);
            item = (BUNDLED_COURSES as any[]).find((x) => String(x.id) === String(dec));
          } catch (e) { }
        }
      }
    }

    if (item) {
      if (item.teacherId) {
        try {
          const tRes = await ddbDocClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: item.teacherId } }));
          if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
            item.teacherName = tRes.Item.name || tRes.Item.displayName;
          }
        } catch (e) {
          console.warn('[courses GET by id] teacher lookup failed', e);
        }
      }
      return NextResponse.json({ ok: true, course: item });
    }

    return NextResponse.json({ ok: false, message: 'Course not found' }, { status: 404 });
  } catch (err: any) {
    console.error('[courses GET by id] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read course' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: any }) {
  try {
    const { id } = await params;
    const body = await req.json();

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
    const updatedCourse = result.Attributes;

    if (updatedCourse && updatedCourse.teacherId) {
      try {
        const tRes = await ddbDocClient.send(new GetCommand({ TableName: TEACHERS_TABLE, Key: { id: updatedCourse.teacherId } }));
        if (tRes.Item && (tRes.Item.name || tRes.Item.displayName)) {
          updatedCourse.teacherName = tRes.Item.name || tRes.Item.displayName;
        }
      } catch (e) {
        console.warn('[courses PATCH] teacher lookup failed', e);
      }
    }

    return NextResponse.json({ ok: true, course: updatedCourse });
  } catch (err: any) {
    console.error('[courses PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to patch course' }, { status: 500 });
  }
}


