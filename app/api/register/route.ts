import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyCaptcha, getBypassSecret, isBypassAllowed } from '@/lib/captcha';
import { headers } from 'next/headers';
import organizationService from '@/lib/organizationService';
import { getOrgUnitById } from '@/lib/orgUnitService';
import orgMembershipService from '@/lib/orgMembershipService';
import { DEFAULT_PLAN_ID, toPlanId } from '@/lib/plans';
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMIT_RULES } from '@/lib/rateLimit';
import {
  SELF_REGISTRATION_PLANS,
  buildNewProfileRecord,
  checkEmailAvailability,
  emailMatchesOrgDomain,
  pickProfileFields,
  resolveSelfRegistrationRole,
  toPublicProfile,
} from '@/lib/registerProfile';


const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || process.env.PROFILES_TABLE || 'jvtutorcorner-profiles';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || process.env.TEACHERS_TABLE || 'jvtutorcorner-teachers';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email: rawEmail, password, captchaToken, captchaValue } = body;
    if (!rawEmail || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 });
    }

    // 限流：同一 IP 短時間內大量註冊 = 灌假帳號。放在驗證碼之前，連驗證碼比對的成本都省下來。
    const clientIp = getClientIp(req);
    const ipLimit = await checkRateLimit(RATE_LIMIT_RULES.registerPerIp, clientIp);
    if (!ipLimit.allowed) {
      console.warn('[register] rate limited by ip', { ip: clientIp, count: ipLimit.count });
      return rateLimitResponse(ipLimit, 'register_too_many_attempts');
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

    // Check existing by email via EmailIndex GSI (fail-open on lookup errors, as before)
    const availability = await checkEmailAvailability(email);
    if (availability === 'taken') {
      return NextResponse.json({ message: 'Email already registered' }, { status: 409 });
    }
    if (availability === 'lookup_failed') {
      console.warn('[register] Email duplicate check failed; continuing');
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
      if (!emailMatchesOrgDomain(email, org.domain)) {
        return NextResponse.json({ message: '此 Email 網域不屬於該組織' }, { status: 400 });
      }
      if (org.usedSeats >= org.maxSeats) {
        // 前置檢查（advisory）— 實際把關仍在 createNewMembersWithLicenses 的交易條件式
        return NextResponse.json({ message: '組織席次已滿' }, { status: 409 });
      }

      if (typeof body.orgUnitId === 'string' && body.orgUnitId.trim()) {
        orgUnitId = String(body.orgUnitId).trim();
        const unit = await getOrgUnitById(orgUnitId);
        if (!unit || unit.orgId !== orgId || unit.status === 'archived') {
          return NextResponse.json({ message: '無效的組織單位' }, { status: 400 });
        }
      }
    }

    // ── Whitelist what a self-registration may write ─────────────────
    // The body used to be spread wholesale into the profile and its `id`/`roid_id`
    // chose the primary key, with no existence condition on the Put. Anyone could
    // therefore pass another user's id and overwrite that account (email and password
    // included), or give themselves role 'admin'/'dept_admin', a paid plan,
    // isOrgAdmin, points, emailVerified... The server now picks the id and copies
    // only the fields in lib/registerProfile.ts. orgId/orgUnitId still go exclusively
    // through orgMembershipService (seat + license accounting).
    const role = resolveSelfRegistrationRole(body.role);
    if (!role) {
      return NextResponse.json({ message: 'invalid_role' }, { status: 400 });
    }

    let plan: string | null = null;
    if (!orgId && role !== 'teacher') {
      const requestedPlan = toPlanId(String(body.plan ?? DEFAULT_PLAN_ID));
      if (!SELF_REGISTRATION_PLANS.includes(requestedPlan)) {
        return NextResponse.json({ message: 'invalid_plan' }, { status: 400 });
      }
      plan = requestedPlan;
    }

    // ── Email Verification Setup ─────────────────────────────────────
    const { sendVerificationEmail } = await import('@/lib/email/verificationService');
    const { initializeVerificationStatus } = await import('@/lib/email/emailVerificationStatus');

    // Same record builder as the CSV batch endpoint (isB2B is false until a seat commits).
    const { id, profile, verificationToken, verificationExpires } = buildNewProfileRecord({
      email,
      password: String(password),
      role,
      plan,
      fields: pickProfileFields(body),
    });

    // Persist Profile to DynamoDB
    try {
      let licenseId: string | undefined;
      if (orgId) {
        // B2B: the profile Put, the license and the seat increment are ONE transaction.
        // The old flow Put the profile first and deleted it if the separate join
        // transaction failed — a failed delete left an orphan account holding the email,
        // and a join that committed but whose follow-up read threw had its (now seated)
        // profile deleted, leaking the seat. With a single transaction there is nothing
        // to roll back.
        const joined = await orgMembershipService.createNewMembersWithLicenses({
          orgId,
          orgUnitId,
          profiles: [profile],
          assignedBy: 'self-registration',
        });
        if (!joined.ok) {
          const msg = joined.error || '無法加入組織';
          console.error('[register] Org registration transaction failed', msg);
          const status = /席次已滿|占用|已屬於其他組織|already|已存在/i.test(msg) ? 409 : 400;
          return NextResponse.json({ message: msg }, { status });
        }
        licenseId = joined.created[0]?.licenseId;
        Object.assign(profile, {
          orgId,
          orgUnitId,
          isB2B: true,
          isOrgAdmin: false,
          licenseId,
          plan: null,
          planBeforeOrg: 'free',
        });
      } else {
        await ddbDocClient.send(new PutCommand({
          TableName: PROFILES_TABLE,
          Item: profile,
          // Never overwrite an existing account, even on a (astronomically unlikely) UUID clash.
          ConditionExpression: 'attribute_not_exists(id)',
        }));
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
      if (role === 'teacher') {
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

      // Never echo the password hash or the email-verification token: returning the
      // token let a registrant verify an address they do not control.
      return NextResponse.json({ ok: true, profile: toPublicProfile(profile), emailSent, orgId: orgId || undefined, licenseId }, { status: 201 });
    } catch (e: any) {
      console.error('[register] DynamoDB Profile write failed', e?.message || e);
      return NextResponse.json({ message: 'Failed to write to DB' }, { status: 500 });
    }
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ message: err?.message || 'Server error' }, { status: 500 });
  }
}
