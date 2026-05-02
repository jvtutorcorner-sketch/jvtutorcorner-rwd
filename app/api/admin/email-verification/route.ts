import { NextRequest, NextResponse } from 'next/server';
import { 
  getEmailVerificationStatus,
  getVerificationSummary,
  getPendingVerifications,
  getExpiredVerificationTokens
} from '@/lib/email/emailVerificationQuery';

/**
 * GET /api/admin/email-verification/status?userId=xxx
 * GET /api/admin/email-verification/summary
 * GET /api/admin/email-verification/pending
 * GET /api/admin/email-verification/expired
 * 
 * 管理員端點，用於查詢郵件驗證狀態
 * 生產環境應該添加認證機制
 */

const ADMIN_SECRET = process.env.ADMIN_API_SECRET;

function validateAdminSecret(req: NextRequest): boolean {
  if (!ADMIN_SECRET) {
    return process.env.NODE_ENV === 'development';
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }
  
  const token = authHeader.replace('Bearer ', '');
  return token === ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  // 驗證管理員認證
  if (!validateAdminSecret(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'summary';

    switch (action) {
      // 查詢特定用戶的驗證狀態
      case 'status': {
        const userId = searchParams.get('userId');
        if (!userId) {
          return NextResponse.json(
            { error: 'userId parameter is required' },
            { status: 400 }
          );
        }

        const status = await getEmailVerificationStatus(userId);
        return NextResponse.json({
          success: true,
          data: status
        });
      }

      // 獲取統計摘要
      case 'summary': {
        const summary = await getVerificationSummary();
        return NextResponse.json({
          success: true,
          data: summary
        });
      }

      // 獲取待驗證的用戶
      case 'pending': {
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
        const pending = await getPendingVerifications(limit);
        
        return NextResponse.json({
          success: true,
          count: pending.length,
          data: pending.map((p: any) => ({
            id: p.id,
            email: p.email,
            createdAt: p.createdAt,
            lastAttemptAt: p.emailVerificationLastAttempt,
            resendCount: p.emailVerificationResendCount || 0,
            verificationExpires: p.verificationExpires
          }))
        });
      }

      // 獲取已過期的驗證 token
      case 'expired': {
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
        const expired = await getExpiredVerificationTokens(limit);
        
        return NextResponse.json({
          success: true,
          count: expired.length,
          data: expired.map((e: any) => ({
            id: e.id,
            email: e.email,
            createdAt: e.createdAt,
            verificationExpires: e.verificationExpires,
            resendCount: e.emailVerificationResendCount || 0
          }))
        });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[AdminEmailVerification] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
