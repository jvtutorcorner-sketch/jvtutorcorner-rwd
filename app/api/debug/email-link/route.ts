import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/apiGuard';
import { resolveEmailLinkBaseUrl } from '@/lib/email/verificationService';

export const dynamic = 'force-dynamic'; // Ensure this route is not cached

/**
 * Reports the base URL that outbound email links are built from.
 *
 * A verification email is sent by whichever process happens to be running, so
 * "the link points at localhost" is usually a stale build rather than a bug.
 * This endpoint shows what the *running* server would put in an email.
 */
const getEmailLinkDiagnostics = async () => {
  const resolvedBaseUrl = resolveEmailLinkBaseUrl();

  return NextResponse.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    config: {
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? null,
      EMAIL_LINK_BASE_URL: process.env.EMAIL_LINK_BASE_URL ?? null,
    },
    resolvedBaseUrl,
    sampleVerifyUrl: `${resolvedBaseUrl}/api/auth/verify-email?token=<token>&email=<email>`,
  });
};

export const GET = withAdmin(getEmailLinkDiagnostics);
