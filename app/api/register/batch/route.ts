import { NextResponse } from 'next/server';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { withAuth, type AuthedRequest } from '@/lib/auth/apiGuard';
import { requireOrgAccess } from '@/lib/auth/orgAccess';
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMIT_RULES } from '@/lib/rateLimit';
import { BATCH_MAX_ROWS, registerMembersBatch, type BatchCreatedMember } from '@/lib/registerProfile';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || process.env.TEACHERS_TABLE || 'jvtutorcorner-teachers';

/**
 * POST /api/register/batch — 企業成員 CSV 批次匯入。
 *
 * 僅限登入後的企業管理員（requireOrgAccess 'write'：系統管理員，或 profile.isOrgAdmin
 * 且 profile.orgId === body.orgId）。dept_admin 與一般成員一律 403。入口在
 * /admin/organizations/[id] 的「成員」分頁（components/org/OrgCsvImportPanel.tsx）。
 *
 * Body: { orgId, orgUnitId?, rows: [{ email, password, firstName, lastName, role,
 * birthdate, gender, country, timezone?, createdAtUtc?, ... }] }
 *
 * All-or-nothing: every row is validated first (required fields, email shape, org domain,
 * duplicates inside the batch, already-registered emails, enough seats for the whole batch);
 * then lib/orgMembershipService.createNewMembersWithLicenses writes profiles + licenses +
 * seats in one transaction (≤ 49 rows) or compensated chunks (50..BATCH_MAX_ROWS rows).
 *
 * Anti-abuse: the session + org scope is the primary control (an org admin can only create
 * accounts inside their own organisation, bounded by that org's remaining seats, and every
 * row must match the org domain). registerBatchPerIp remains as a blast-radius cap on how
 * many batches one IP can fire per hour. Note this route deliberately does NOT count against
 * registerPerIp: that counter guards the public signup form, and sharing it would let a few
 * employees self-registering from the office network block their own admin's import.
 */
async function handlePost(req: AuthedRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'invalid_json' }, { status: 400 });
  }

  const orgId = typeof body?.orgId === 'string' ? body.orgId.trim() : '';
  const orgUnitId = typeof body?.orgUnitId === 'string' && body.orgUnitId.trim() ? body.orgUnitId.trim() : null;
  const rows = body?.rows;
  if (!orgId) {
    return NextResponse.json({ ok: false, message: 'org_required' }, { status: 400 });
  }

  // 組織範圍授權 —— 在讀 rows 之前就擋掉，避免非管理員探測席次/網域等資訊。
  const guard = await requireOrgAccess(req, orgId, 'write');
  if (!guard.ok) return guard.response;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ ok: false, message: 'batch_empty' }, { status: 400 });
  }
  if (rows.length > BATCH_MAX_ROWS) {
    return NextResponse.json({ ok: false, message: 'batch_too_large', maxRows: BATCH_MAX_ROWS }, { status: 400 });
  }

  const clientIp = getClientIp(req);
  const batchLimit = await checkRateLimit(RATE_LIMIT_RULES.registerBatchPerIp, clientIp);
  if (!batchLimit.allowed) {
    console.warn('[register/batch] rate limited by ip (batch)', { ip: clientIp, count: batchLimit.count });
    return rateLimitResponse(batchLimit, 'register_too_many_attempts');
  }

  let result;
  try {
    result = await registerMembersBatch({ orgId, orgUnitId, rows });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[register/batch] unexpected failure', detail);
    return NextResponse.json({ ok: false, message: 'batch_failed' }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.code,
        detail: result.message,
        rowErrors: result.rowErrors,
        // Only present when compensation itself failed: these accounts were created and
        // could not be removed automatically (also logged as REGISTER_BATCH_PARTIAL).
        partial: result.leftBehind ? { profileIds: result.leftBehind.map((m) => m.profileId) } : undefined,
      },
      { status: result.status }
    );
  }

  // ── After commit: same side effects as single registration ──
  const { sendVerificationEmail } = await import('@/lib/email/verificationService');
  const { initializeVerificationStatus } = await import('@/lib/email/emailVerificationStatus');

  let emailsSent = 0;
  const afterCommit = async (member: BatchCreatedMember) => {
    try {
      await initializeVerificationStatus(member.profileId, member.email, member.verificationToken, member.verificationExpires);
    } catch (err) {
      console.error('[register/batch] Failed to initialize verification status', member.profileId, err);
    }
    try {
      if (await sendVerificationEmail(member.email, member.verificationToken)) emailsSent++;
    } catch (err) {
      console.error('[register/batch] Failed to send verification email', member.profileId, err);
    }
    if (member.role === 'teacher') {
      const p = member.profile as Record<string, string | undefined>;
      try {
        await ddbDocClient.send(new PutCommand({
          TableName: TEACHERS_TABLE,
          Item: {
            id: member.profileId,
            name: p.name || (p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : member.email),
            email: member.email,
            subjects: [],
            languages: ['中文'],
            rating: 0,
            hourlyRate: 0,
            location: '',
            intro: p.bio || '',
            createdAt: p.createdAt,
          },
        }));
      } catch (te) {
        console.error('[register/batch] Teacher record creation failed', member.profileId, te);
      }
    }
  };

  // Awaited (serverless may freeze after the response), with bounded SMTP concurrency.
  const queue = [...result.created];
  await Promise.all(
    Array.from({ length: Math.min(5, queue.length) }, async () => {
      for (let m = queue.shift(); m; m = queue.shift()) await afterCommit(m);
    })
  );

  return NextResponse.json(
    {
      ok: true,
      created: result.created.length,
      members: result.created.map((m) => ({ email: m.email, profileId: m.profileId })),
      emailsSent,
    },
    { status: 201 }
  );
}

export const POST = withAuth(handlePost);
