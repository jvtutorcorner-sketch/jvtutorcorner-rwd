import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { MOCK_USERS } from '@/lib/mockAuth';

const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const id = url.searchParams.get('id');

    if (email) {
      const emailLower = String(email).toLowerCase();
      // Look up in DynamoDB
      try {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({
          TableName: PROFILES_TABLE,
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': emailLower }
        }));

        let profile = scanRes?.Items?.[0] || null;

        if (!profile) {
          // Fallback to MOCK_USERS for demo/test accounts
          const mock = MOCK_USERS[emailLower];
          if (mock) {
            profile = {
              ...mock,
              email: emailLower,
              id: mock.teacherId || `mock_${emailLower.replace(/[@.]/g, '_')}`,
              roid_id: mock.teacherId || `mock_${emailLower.replace(/[@.]/g, '_')}`,
              role: mock.teacherId ? 'teacher' : 'user'
            };
          }
        }

        if (profile) return NextResponse.json({ ok: true, profile });
      } catch (e) {
        console.warn('[profile GET] Dynamo lookup failed', (e as any)?.message || e);
      }
      return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
    }

    if (id) {
      try {
        const getRes: any = await ddbDocClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id } }));
        let profile = getRes?.Item || null;

        if (!profile) {
          // Fallback scan by roid_id
          const scanRes: any = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'roid_id = :rid',
            ExpressionAttributeValues: { ':rid': id }
          }));
          profile = scanRes?.Items?.[0] || null;
        }

        if (!profile) {
          // Fallback to MOCK_USERS by teacherId or generated mock id
          const mockEntry = Object.entries(MOCK_USERS).find(([mEmail, u]) => {
            const mockId = (u as any).teacherId || `mock_${mEmail.toLowerCase().replace(/[@.]/g, '_')}`;
            return mockId === id;
          });
          if (mockEntry) {
            const [mEmail, mock] = mockEntry;
            const emailLower = mEmail.toLowerCase();
            profile = {
              ...mock,
              email: emailLower,
              id: (mock as any).teacherId || `mock_${emailLower.replace(/[@.]/g, '_')}`,
              roid_id: (mock as any).teacherId || `mock_${emailLower.replace(/[@.]/g, '_')}`,
              role: (mock as any).teacherId ? 'teacher' : 'user'
            };
          }
        }

        if (profile) return NextResponse.json({ ok: true, profile });
      } catch (e) {
        console.warn('[profile GET] Dynamo lookup by ID failed', (e as any)?.message || e);
      }
      return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
    }

    // List all (scan)
    const res: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE }));
    return NextResponse.json({ ok: true, profiles: res.Items || [] });
  } catch (err: any) {
    console.error('[profile GET] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to read profiles' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body || (!body.email && !body.id)) {
      return NextResponse.json({ ok: false, message: 'email or id required' }, { status: 400 });
    }

    const email = body.email ? String(body.email).toLowerCase() : undefined;
    const id = body.id;

    let profile: any = null;

    // Look up existing profile in DynamoDB
    try {
      if (id) {
        const getRes: any = await ddbDocClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id } }));
        profile = getRes?.Item || null;
        if (!profile) {
          const scanRes: any = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'roid_id = :rid',
            ExpressionAttributeValues: { ':rid': id }
          }));
          profile = scanRes?.Items?.[0] || null;
        }
      } else if (email) {
        const scanRes: any = await ddbDocClient.send(new ScanCommand({
          TableName: PROFILES_TABLE,
          FilterExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': email }
        }));
        profile = scanRes?.Items?.[0] || null;
      }
    } catch (e) {
      console.warn('[profile PATCH] Existing lookup failed', (e as any)?.message || e);
    }

    // Fallback to MOCK_USERS if not in DB
    if (!profile) {
      if (email) {
        const mock = MOCK_USERS[email];
        if (mock) {
          profile = {
            ...mock,
            email,
            id: mock.teacherId || `mock_${email.replace(/[@.]/g, '_')}`,
            roid_id: mock.teacherId || `mock_${email.replace(/[@.]/g, '_')}`,
            role: mock.teacherId ? 'teacher' : 'user'
          };
        }
      } else if (id) {
        const mockEntry = Object.entries(MOCK_USERS).find(([mEmail, u]) => {
          const mockId = (u as any).teacherId || `mock_${mEmail.toLowerCase().replace(/[@.]/g, '_')}`;
          return mockId === id;
        });
        if (mockEntry) {
          const [mEmail, mock] = mockEntry;
          const emailLower = mEmail.toLowerCase();
          profile = {
            ...mock,
            email: emailLower,
            id: (mock as any).teacherId || `mock_${emailLower.replace(/[@.]/g, '_')}`,
            roid_id: (mock as any).teacherId || `mock_${emailLower.replace(/[@.]/g, '_')}`,
            role: (mock as any).teacherId ? 'teacher' : 'user'
          };
        }
      }
    }

    if (!profile) {
      return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
    }

    // Apply updates
    const updates: any = {};
    const fields = ['firstName', 'lastName', 'bio', 'backupEmail', 'birthdate', 'gender', 'country', 'timezone', 'card'];
    fields.forEach(f => {
      if (body[f] !== undefined) updates[f] = body[f];
    });

    if (body.pointsToAdd !== undefined && typeof body.pointsToAdd === 'number') {
      const currentPoints = typeof profile.points === 'number' ? profile.points : 0;
      updates.points = Math.max(0, currentPoints + body.pointsToAdd);
    }

    if (updates.bio && String(updates.bio).length > 500) {
      return NextResponse.json({ ok: false, message: 'bio too long (max 500 chars)' }, { status: 400 });
    }

    const nowUtc = new Date().toISOString();
    const timezone = updates.timezone || profile.timezone || 'UTC';
    let local = nowUtc;
    try {
      const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const parts = fmt.formatToParts(new Date()).reduce((acc: any, part) => { acc[part.type] = (acc[part.type] || '') + part.value; return acc; }, {});
      local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    } catch { }

    const merged = { ...profile, ...updates, updatedAtUtc: nowUtc, updatedAtLocal: local };
    if (!merged.id) merged.id = merged.roid_id; // ensure primary key

    // Persist to DynamoDB
    try {
      await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: merged }));
      return NextResponse.json({ ok: true, profile: merged });
    } catch (e) {
      console.error('[profile PATCH] Dynamo write failed', (e as any)?.message || e);
      return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[profile PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
  }
}
