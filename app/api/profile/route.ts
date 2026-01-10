import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import resolveDataFile from '@/lib/localData';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { MOCK_USERS } from '@/lib/mockAuth';

async function readProfiles(): Promise<any[]> {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
  const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;
  if (useDynamo) {
    try {
      const res: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE }));
      return res.Items || [];
    } catch (e) {
      console.warn('[profile] Dynamo scan failed, falling back to file', (e as any)?.message || e);
    }
  }
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

async function writeProfiles(arr: any[]) {
  const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
  const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;
  if (useDynamo) {
    try {
      // overwrite all items by writing each item (demo convenience)
      for (const item of arr) {
        await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: item }));
      }
      return;
    } catch (e) {
      console.warn('[profile API] Dynamo write failed', (e as any)?.message || e);
    }
  }
  try {
    const DATA_FILE = await resolveDataFile('profiles.json');
    await fs.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.warn('[profile API] failed to write profiles', (err as any)?.message || err);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const id = url.searchParams.get('id');
    const profiles = await readProfiles();
    if (email) {
      const emailLower = String(email).toLowerCase();
      const candidates = profiles.filter((x) => String(x.email).toLowerCase() === emailLower);
      if (candidates.length === 0) {
        // Fallback to MOCK_USERS for demo/test accounts
        const mock = MOCK_USERS[emailLower];
        if (mock) {
          const mockProfile = {
            ...mock,
            email: emailLower,
            roid_id: mock.teacherId || `mock_${emailLower.replace(/[@.]/g, '_')}`,
            role: mock.teacherId ? 'teacher' : 'user'
          };
          (mockProfile as any).id = mockProfile.roid_id;
          return NextResponse.json({ ok: true, profile: mockProfile });
        }
        return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      }

      // If multiple entries exist for the same email, prefer the one with `points` defined,
      // otherwise pick the one with the most recent updatedAtUtc if available.
      let best = candidates[0];
      for (const c of candidates) {
        if (best.points === undefined && c.points !== undefined) {
          best = c;
          continue;
        }
        const a = best.updatedAtUtc ? new Date(best.updatedAtUtc).getTime() : 0;
        const b = c.updatedAtUtc ? new Date(c.updatedAtUtc).getTime() : 0;
        if (b > a) best = c;
      }
      return NextResponse.json({ ok: true, profile: best });
    }
    if (id) {
      const p = profiles.find((x) => x.roid_id === id || x.id === id);
      if (!p) {
        // Fallback to MOCK_USERS by teacherId or generated mock id
        const mockEntry = Object.entries(MOCK_USERS).find(([email, u]) => {
          const mockId = (u as any).teacherId || `mock_${email.toLowerCase().replace(/[@.]/g, '_')}`;
          return mockId === id;
        });
        if (mockEntry) {
          const [email, mock] = mockEntry;
          const mockProfile = {
            ...mock,
            email: email.toLowerCase(),
            roid_id: (mock as any).teacherId || `mock_${email.toLowerCase().replace(/[@.]/g, '_')}`,
            role: (mock as any).teacherId ? 'teacher' : 'user'
          };
          (mockProfile as any).id = mockProfile.roid_id;
          return NextResponse.json({ ok: true, profile: mockProfile });
        }
        return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, profile: p });
    }
    return NextResponse.json({ ok: true, profiles });
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

    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || '';
    const useDynamo = typeof PROFILES_TABLE === 'string' && PROFILES_TABLE.length > 0;
    let profile: any = null;
    let profiles = [] as any[];

    if (useDynamo) {
      try {
        if (email) {
          const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'email = :email', ExpressionAttributeValues: { ':email': email } }));
          profile = scanRes?.Items?.[0] || null;
        } else if (id) {
          try {
            const getRes: any = await ddbDocClient.send(new GetCommand({ TableName: PROFILES_TABLE, Key: { id } }));
            profile = getRes?.Item || null;
            if (!profile) {
              // fallback: scan by roid_id
              const scanRes: any = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, FilterExpression: 'roid_id = :rid', ExpressionAttributeValues: { ':rid': id } }));
              profile = scanRes?.Items?.[0] || null;
            }
          } catch (e) {
            console.warn('[profile GET] Dynamo get/scan failed', (e as any)?.message || e);
          }
        }
      } catch (e) {
        console.warn('[profile GET] Dynamo lookup failed', (e as any)?.message || e);
      }
    }

    if (!profile) {
      profiles = await readProfiles();
      const idx = profiles.findIndex((p) => {
        if (email) return String(p.email).toLowerCase() === email;
        return p.roid_id === id || p.id === id;
      });
      if (idx === -1) {
        // Fallback to MOCK_USERS for demo/test accounts
        if (email) {
          const mock = MOCK_USERS[email];
          if (mock) {
            profile = {
              ...mock,
              email: email,
              roid_id: mock.teacherId || `mock_${email.replace(/[@.]/g, '_')}`,
              role: mock.teacherId ? 'teacher' : 'user'
            };
            (profile as any).id = profile.roid_id;
          }
        } else if (id) {
          // Fallback to MOCK_USERS by teacherId or generated mock id
          const mockEntry = Object.entries(MOCK_USERS).find(([email, u]) => {
            const mockId = (u as any).teacherId || `mock_${email.toLowerCase().replace(/[@.]/g, '_')}`;
            return mockId === id;
          });
          if (mockEntry) {
            const [mockEmail, mock] = mockEntry;
            profile = {
              ...mock,
              email: mockEmail.toLowerCase(),
              roid_id: (mock as any).teacherId || `mock_${mockEmail.toLowerCase().replace(/[@.]/g, '_')}`,
              role: (mock as any).teacherId ? 'teacher' : 'user'
            };
            (profile as any).id = profile.roid_id;
          }
        }
        if (!profile) return NextResponse.json({ ok: false, message: 'Profile not found' }, { status: 404 });
      } else {
        profile = profiles[idx];
      }
    }
    // apply allowed updates (for demo, we allow adding/updating payment info and names)
    const updates: any = {};
    if (body.firstName !== undefined) updates.firstName = body.firstName;
    if (body.lastName !== undefined) updates.lastName = body.lastName;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.backupEmail !== undefined) updates.backupEmail = body.backupEmail;
    if (body.birthdate !== undefined) updates.birthdate = body.birthdate;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.country !== undefined) updates.country = body.country;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.card) updates.card = body.card; // caution: demo only

    // Handle points update
    if (body.pointsToAdd !== undefined && typeof body.pointsToAdd === 'number') {
      const currentPoints = typeof profile.points === 'number' ? profile.points : 0;
      // ensure we don't store negative points
      const newPoints = currentPoints + body.pointsToAdd;
      updates.points = typeof newPoints === 'number' ? Math.max(0, newPoints) : currentPoints;
    }

    // server-side validation for bio length
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
    } catch {}

    const merged = { ...profile, ...updates, updatedAtUtc: nowUtc, updatedAtLocal: local };
    // persist
    if (useDynamo) {
      try {
        await ddbDocClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: merged }));
        return NextResponse.json({ ok: true, profile: merged });
      } catch (e) {
        console.error('[profile PATCH] Dynamo write failed', (e as any)?.message || e);
        return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
      }
    }

    const profilesAll = await readProfiles();
    // Prefer matching by email (case-insensitive) to avoid replacing the wrong duplicate entry.
    const emailLower = merged?.email ? String(merged.email).toLowerCase() : null;
    let idx2 = -1;
    if (emailLower) {
      idx2 = profilesAll.findIndex((p) => String(p.email || '').toLowerCase() === emailLower);
    }
    if (idx2 === -1) {
      idx2 = profilesAll.findIndex((p) => p.roid_id === merged.roid_id || p.id === merged.id);
    }
    if (idx2 !== -1) profilesAll[idx2] = merged; else profilesAll.push(merged);
    // remove other duplicates with same email (keep the merged one)
    try {
      const emailLower = merged?.email ? String(merged.email).toLowerCase() : null;
      if (emailLower) {
        const filtered: any[] = [];
        for (let i = 0; i < profilesAll.length; i++) {
          const p = profilesAll[i];
          if (i === idx2) {
            filtered.push(p);
            continue;
          }
          if (String(p.email || '').toLowerCase() === emailLower) {
            // skip duplicate
            continue;
          }
          filtered.push(p);
        }
        await writeProfiles(filtered);
      } else {
        await writeProfiles(profilesAll);
      }
    } catch (e) {
      // fallback to writing full array
      await writeProfiles(profilesAll);
    }
    return NextResponse.json({ ok: true, profile: merged });
  } catch (err: any) {
    console.error('[profile PATCH] error', err?.message || err);
    return NextResponse.json({ ok: false, message: 'Failed to update profile' }, { status: 500 });
  }
}
