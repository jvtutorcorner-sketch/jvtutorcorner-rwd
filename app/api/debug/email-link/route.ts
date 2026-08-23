import { NextResponse } from 'next/server';
import { withAdmin, AuthedRequest } from '@/lib/auth/apiGuard';
import { resolveEmailLinkBaseUrl } from '@/lib/email/verificationService';

export const dynamic = 'force-dynamic'; // Ensure this route is not cached

/**
 * Reports the base URL that outbound email links are built from.
 *
 * Verification emails now prioritize the *incoming request's* host over the
 * build-time-inlined NEXT_PUBLIC_BASE_URL, so the resolved URL reflects
 * whichever domain hit this endpoint (production vs. staging).
 */
const getEmailLinkDiagnostics = async (req: AuthedRequest) => {
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host');
  const requestOrigin = host ? `${protocol}://${host}` : undefined;
  const resolvedBaseUrl = resolveEmailLinkBaseUrl(requestOrigin);

  return NextResponse.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    config: {
      requestOrigin: requestOrigin ?? null,
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? null,
      EMAIL_LINK_BASE_URL: process.env.EMAIL_LINK_BASE_URL ?? null,
    },
    resolvedBaseUrl,
    sampleVerifyUrl: `${resolvedBaseUrl}/api/auth/verify-email?token=<token>&email=<email>`,
  });
};

export const GET = withAdmin(getEmailLinkDiagnostics);
