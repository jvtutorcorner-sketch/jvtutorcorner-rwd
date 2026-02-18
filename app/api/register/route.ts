import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || process.env.TEACHERS_TABLE || 'jvtutorcorner-teachers';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.email || !body.password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    const email = String(body.email).toLowerCase();
    if (body.bio && String(body.bio).length > 500) {
      return NextResponse.json({ message: 'bio too long (max 500 chars)' }, { status: 400 });
    }

    // Check existing by email
    try {
      const scanRes: any = await ddbDocClient.send(new ScanCommand({
        TableName: PROFILES_TABLE,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email }
      }));
      if (scanRes?.Count > 0) {
        return NextResponse.json({ message: 'Email already registered' }, { status: 409 });
      }
    } catch (e) {
      console.warn('[register] Dynamo email check failed', (e as any)?.message || e);
    }

    // Note: For simplicity, password is stored as-is. In production, hash passwords.
    const plan = body.role === 'teacher' ? null : (body.plan ?? 'free');

    // Create profile object
    const profile = {
      ...body,
      email,
      plan,
      createdAt: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString()
    };

    // Use roid_id as primary identifier
    const id = profile.id || profile.roid_id || `u_${Date.now()}`;
    profile.roid_id = profile.roid_id || id;
    profile.id = id;

    // Persist Profile to DynamoDB
    try {
      await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: profile }));

      // If role is teacher, also create a teacher record
      if (body.role === 'teacher') {
        const teacherRecord = {
          id: profile.roid_id,
          name: profile.name || (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : profile.email),
          email: profile.email,
          avatarUrl: profile.avatarUrl || 'https://avatars.githubusercontent.com/u/1?v=4',
          subjects: body.subjects || [],
          languages: body.languages || ['中文'],
          rating: 0,
          hourlyRate: body.hourlyRate || 0,
          location: body.location || '',
          intro: profile.bio || profile.intro || '',
          createdAt: profile.createdAt
        };
        try {
          await ddbDocClient.send(new PutCommand({ TableName: TEACHERS_TABLE, Item: teacherRecord }));
        } catch (te) {
          console.error('[register] Teacher record creation failed', te);
        }
      }

      return NextResponse.json({ ok: true, profile }, { status: 201 });
    } catch (e: any) {
      console.error('[register] DynamoDB Profile write failed', e?.message || e);
      return NextResponse.json({ message: 'Failed to write to DB' }, { status: 500 });
    }
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}
