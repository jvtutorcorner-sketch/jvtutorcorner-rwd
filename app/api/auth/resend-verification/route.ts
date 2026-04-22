import { NextRequest, NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { sendVerificationEmail, generateVerificationToken } from '@/lib/email/verificationService';
import { updateEmailVerificationStatus } from '@/lib/email/emailVerificationStatus';

/**
 * POST /api/auth/resend-verification
 * 
 * 重新發送驗證信到用戶郵箱
 * 包含防濫用機制（5分鐘內只能發送1次）
 */

const RESEND_COOLDOWN_MINUTES = 5;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: '郵件地址為必填項目' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();
    const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

    // 1. 查詢用戶
    const { Items } = await ddbDocClient.send(new ScanCommand({
      TableName: PROFILES_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail }
    }));

    if (!Items?.length) {
      // 出於安全考量，不洩露帳戶不存在的信息
      return NextResponse.json(
        { success: true, message: '如果該郵件地址已註冊，驗證信將被重新發送' },
        { status: 200 }
      );
    }

    const profile = Items[0];

    // 2. 檢查是否已驗證
    if (profile.emailVerified) {
      return NextResponse.json(
        { error: '此郵件地址已驗證' },
        { status: 400 }
      );
    }

    // 3. 檢查冷卻時間（防濫用）
    if (profile.emailVerificationLastResendAt) {
      const lastResend = new Date(profile.emailVerificationLastResendAt);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastResend.getTime()) / 60000;

      if (diffMinutes < RESEND_COOLDOWN_MINUTES) {
        const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MINUTES - diffMinutes) * 60);
        return NextResponse.json(
          { 
            error: `請等待 ${remainingSeconds} 秒後再試`,
            retryAfter: remainingSeconds
          },
          { status: 429 }
        );
      }
    }

    // 4. 檢查重新發送次數上限（防止濫用）
    const resendCount = profile.emailVerificationResendCount || 0;
    if (resendCount >= 5) {
      return NextResponse.json(
        { 
          error: '重新發送驗證信的次數已達上限，請稍後再試或聯繫支援'
        },
        { status: 429 }
      );
    }

    // 5. 生成新的驗證 token
    const newToken = generateVerificationToken();
    const newTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // 6. 發送驗證信
    const emailSent = await sendVerificationEmail(normalizedEmail, newToken);

    if (!emailSent) {
      return NextResponse.json(
        { error: '發送驗證信失敗，請稍後再試' },
        { status: 500 }
      );
    }

    // 7. 更新驗證狀態
    await updateEmailVerificationStatus(
      profile.id,
      normalizedEmail,
      'RESENT',
      {
        emailVerificationStatus: 'resend_requested',
        emailVerificationResendCount: resendCount + 1,
        emailVerificationLastResendAt: now,
        emailVerificationLastAttempt: now
      },
      {
        token: newToken,
        tokenExpiresAt: newTokenExpires,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined
      }
    );

    console.log(`[ResendVerification] ✅ Verification email resent to ${normalizedEmail} (attempt ${resendCount + 1})`);

    return NextResponse.json(
      { 
        success: true, 
        message: '驗證信已重新發送，請檢查您的郵箱'
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('[ResendVerification] Error:', error);
    return NextResponse.json(
      { error: '處理請求時發生錯誤' },
      { status: 500 }
    );
  }
}
