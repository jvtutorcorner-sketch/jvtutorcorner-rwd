import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { findProfileByEmail } from '@/lib/profilesService';
import { verifyCaptcha, getBypassSecret, isBypassAllowed } from '@/lib/captcha';
import { headers } from 'next/headers';
import organizationService from '@/lib/organizationService';
import { getOrgUnitById } from '@/lib/orgUnitService';
import orgMembershipService from '@/lib/orgMembershipService';


const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || process.env.TEACHERS_TABLE || 'jvtutorcorner-teachers';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email: rawEmail, password, captchaToken, captchaValue } = body;
    if (!rawEmail || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }


    // Validate captcha (supporting bypass secret / header)
    const headerList = await headers();
    const e2eHeader = headerList.get('X-E2E-Secret');
    const bypassAllowed = await isBypassAllowed();
    const bypassSecret = bypassAllowed ? getBypassSecret() : undefined;
    const isBypass = Boolean(bypassSecret) && (
      (captchaValue && bypassSecret && captchaValue.trim() === bypassSecret.trim()) || 
      (e2eHeader && bypassSecret && e2eHeader.trim() === bypassSecret.trim())
    );

    if (!isBypass && !(await verifyCaptcha(captchaToken, captchaValue))) {
      return NextResponse.json({ message: 'captcha_incorrect' }, { status: 400 });
    }



    const email = String(rawEmail).toLowerCase();

    if (body.bio && String(body.bio).length > 500) {
      return NextResponse.json({ message: 'bio too long (max 500 chars)' }, { status: 400 });
    }

    // Check existing by email via EmailIndex GSI
    try {
      const existing = await findProfileByEmail(email);
      if (existing) {
        return NextResponse.json({ message: 'Email already registered' }, { status: 409 });
      }
    } catch (e) {
      console.warn('[register] Email duplicate check failed', (e as any)?.message || e);
    }

    // ── Optional B2B org assignment ──────────────────────────────────
    // Every branch below is gated on orgId being present, so a request without it
    // (the existing app/login/register/page.tsx B2C flow) executes byte-for-byte the
    // same as before this change.
    let orgId: string | null = null;
    let orgUnitId: string | null = null;
    if (typeof body.orgId === 'string' && body.orgId.trim()) {
      orgId = String(body.orgId).trim();

      const org = await organizationService.getOrganizationById(orgId);
      if (!org) {
        return NextResponse.json({ message: '無效的組織' }, { status: 400 });
      }
      if (org.status !== 'active' && org.status !== 'trial') {
        return NextResponse.json({ message: '此組織目前無法接受新成員註冊' }, { status: 400 });
      }
      if (org.domain) {
        const normalizedDomain = org.domain.replace(/^@/, '').toLowerCase();
        if (!email.endsWith(`@${normalizedDomain}`)) {
          return NextResponse.json({ message: '此 Email 網域不屬於該組織' }, { status: 400 });
        }
      }
      if (org.usedSeats >= org.maxSeats) {
        // 前置檢查（advisory）— 實際把關仍在 assignMemberWithLicense 的交易條件式
        return NextResponse.json({ message: '組織席次已滿' }, { status: 409 });
      }

      if (typeof body.orgUnitId === 'string' && body.orgUnitId.trim()) {
        orgUnitId = String(body.orgUnitId).trim();
        const unit = await getOrgUnitById(orgUnitId);
        if (!unit || unit.orgId !== orgId) {
          return NextResponse.json({ message: '無效的組織單位' }, { status: 400 });
        }
      }
    }

    // Strip orgId/orgUnitId out of what gets spread into the profile — they're handled
    // explicitly via orgMembershipService.assignMemberWithLicense below, not written
    // directly, so a request can't set them without going through seat/license accounting.
    const { orgId: _rawOrgId, orgUnitId: _rawOrgUnitId, ...profileBody } = body;

    // Note: For simplicity, password is stored as-is. In production, hash passwords.
    const plan = orgId ? null : (body.role === 'teacher' ? null : (body.plan ?? 'free'));

    // ── Email Verification Setup ─────────────────────────────────────
    const { generateVerificationToken, sendVerificationEmail } = await import('@/lib/email/verificationService');
    const { initializeVerificationStatus } = await import('@/lib/email/emailVerificationStatus');
    
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Create profile object
    const profile = {
      ...profileBody,
      email,
      plan,
      isB2B: Boolean(orgId),
      emailVerified: false,
      verificationToken,
      verificationExpires,
      // Initialize verification tracking fields
      emailVerificationStatus: 'pending',
      emailVerificationAttempts: 0,
      emailVerificationResendCount: 0,
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

      // If this is a B2B registration, atomically mint/consume a license and increment
      // the org's seat count. On failure, roll back the just-created profile — a B2B
      // registration must never leave an orphaned account with org fields but no seat.
      let licenseId: string | undefined;
      if (orgId) {
        try {
          const assignResult = await orgMembershipService.assignMemberWithLicense({
            orgId,
            profileId: id,
            orgUnitId,
            assignedBy: 'self-registration'
          });
          licenseId = assignResult.license.id;
        } catch (assignErr: any) {
          console.error('[register] Org assignment failed, rolling back profile', assignErr?.message || assignErr);
          try {
            await ddbDocClient.send(new DeleteCommand({ TableName: PROFILES_TABLE, Key: { id } }));
          } catch (rollbackErr) {
            console.error('[register] Failed to roll back profile after org assignment failure', rollbackErr);
          }
          const msg = assignErr?.message || '無法加入組織';
          const status = /席次已滿|占用|已屬於其他組織|already/i.test(msg) ? 409 : 400;
          return NextResponse.json({ message: msg }, { status });
        }
      }

      // Initialize verification status and log the SENT event.
      // Must be awaited (not fire-and-forget): on serverless compute the
      // execution context can be frozen once the response is sent, killing
      // any pending SMTP handshake before it completes.
      let emailSent = false;
      try {
        await initializeVerificationStatus(id, email, verificationToken, verificationExpires);
      } catch (err) {
        console.error('[register] Failed to initialize verification status', err);
      }

      try {
        emailSent = await sendVerificationEmail(email, verificationToken);
      } catch (err) {
        console.error('[register] Failed to send verification email', err);
      }

      // If role is teacher, also create a teacher record
      if (body.role === 'teacher') {
        const teacherRecord = {
          id: profile.roid_id,
          name: profile.name || (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : profile.email),
          email: profile.email,
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

      return NextResponse.json({ ok: true, profile, emailSent, orgId: orgId || undefined, licenseId }, { status: 201 });
    } catch (e: any) {
      console.error('[register] DynamoDB Profile write failed', e?.message || e);
      return NextResponse.json({ message: 'Failed to write to DB' }, { status: 500 });
    }
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}
