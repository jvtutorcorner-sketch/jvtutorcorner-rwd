import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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
            return NextResponse.redirect(new URL('/auth/verify-email?error=invalid_token', req.url));
        }

        const profile = Items[0];

        // 2. Check expiry
        if (profile.verificationExpires && new Date(profile.verificationExpires) < new Date()) {
            return NextResponse.redirect(new URL('/auth/verify-email?error=token_expired', req.url));
        }

        // 3. Update profile as verified
        await ddbDocClient.send(new UpdateCommand({
            TableName: PROFILES_TABLE,
            Key: { id: profile.id },
            UpdateExpression: 'SET emailVerified = :v, verificationToken = :null, verificationExpires = :null, updatedAtUtc = :now',
            ExpressionAttributeValues: {
                ':v': true,
                ':null': null,
                ':now': new Date().toISOString()
            }
        }));

        console.log(`[VerifyEmail] ✅ Email ${email} verified successfully`);

        // 4. Redirect to verification success page
        return NextResponse.redirect(new URL('/auth/verify-email?message=email_verified', req.url));

    } catch (error) {
        console.error('[VerifyEmail] Error during verification:', error);
        return NextResponse.redirect(new URL('/auth/verify-email?error=verification_failed', req.url));
    }
}
