import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { 
  updateEmailVerificationStatus, 
  clearVerificationToken 
} from '@/lib/email/emailVerificationStatus';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email')?.toLowerCase();

    if (!token || !email) {
        return NextResponse.redirect(new URL('/auth/verify-email?error=invalid_verification_link', req.url));
    }

    try {
        const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

        // 1. Find user by email and token
        const { Items } = await ddbDocClient.send(new ScanCommand({
            TableName: PROFILES_TABLE,
            FilterExpression: 'email = :email AND verificationToken = :token',
            ExpressionAttributeValues: {
                ':email': email,
                ':token': token
            }
        }));

        if (!Items || Items.length === 0) {
            // 記錄失敗事件
            const { logEmailVerificationEvent } = await import('@/lib/email/emailVerificationLog');
            await logEmailVerificationEvent(
                'unknown',
                email,
                'FAILED',
                {
                    status: 'failure',
                    errorCode: 'INVALID_TOKEN',
                    errorMessage: `Invalid or expired token for ${email}`,
                    ipAddress: req.headers.get('x-forwarded-for') || undefined,
                    userAgent: req.headers.get('user-agent') || undefined
                }
            );
            
            return NextResponse.redirect(new URL('/auth/verify-email?error=invalid_token', req.url));
        }

        const profile = Items[0];
        const now = new Date();
        const tokenExpires = profile.verificationExpires ? new Date(profile.verificationExpires) : null;

        // 2. Check expiry
        if (tokenExpires && tokenExpires < now) {
            // 記錄過期事件
            await updateEmailVerificationStatus(
                profile.id,
                email,
                'EXPIRED',
                {
                    emailVerificationStatus: 'failed',
                    emailVerificationAttempts: (profile.emailVerificationAttempts || 0) + 1,
                    emailVerificationLastAttempt: now.toISOString()
                },
                {
                    token,
                    errorCode: 'TOKEN_EXPIRED',
                    errorMessage: `Token expired at ${tokenExpires?.toISOString()}`,
                    ipAddress: req.headers.get('x-forwarded-for') || undefined,
                    userAgent: req.headers.get('user-agent') || undefined
                }
            );

            return NextResponse.redirect(new URL('/auth/verify-email?error=token_expired', req.url));
        }

        // 3. Check if already verified
        if (profile.emailVerified) {
            return NextResponse.redirect(new URL('/auth/verify-email?error=already_verified', req.url));
        }

        // 4. Update profile as verified with detailed tracking
        const verificationDuration = Math.floor(
            (now.getTime() - new Date(profile.verificationExpires || now).getTime()) / 1000
        ) + (24 * 60 * 60); // token 建立後持續時間

        await updateEmailVerificationStatus(
            profile.id,
            email,
            'VERIFIED',
            {
                emailVerified: true,
                emailVerificationStatus: 'verified',
                emailVerificationSuccessAt: now.toISOString(),
                emailVerificationAttempts: (profile.emailVerificationAttempts || 0) + 1,
                emailVerificationLastAttempt: now.toISOString()
            },
            {
                token,
                duration: verificationDuration,
                ipAddress: req.headers.get('x-forwarded-for') || undefined,
                userAgent: req.headers.get('user-agent') || undefined
            }
        );

        // 5. Clear the verification token
        await clearVerificationToken(profile.id);

        console.log(`[VerifyEmail] ✅ Email ${email} verified successfully by user ${profile.id}`);

        // 6. Redirect to verification success page
        return NextResponse.redirect(new URL('/auth/verify-email?message=email_verified', req.url));

    } catch (error) {
        console.error('[VerifyEmail] Error during verification:', error);
        return NextResponse.redirect(new URL('/auth/verify-email?error=verification_failed', req.url));
    }
}
