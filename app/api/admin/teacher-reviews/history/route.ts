// app/api/admin/teacher-reviews/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllReviewRecords, 
  getReviewRecordsByTeacherId,
  getRecentReviewRecords,
  getReviewStats
} from '@/lib/teacherReviewService';

export const runtime = 'nodejs';

/**
 * GET /api/admin/teacher-reviews/history
 * Query params:
 * - teacherId: Filter by specific teacher
 * - limit: Number of records to return (default: 20)
 * - recent: If true, return recent reviews sorted by date
 * - stats: If true, return statistics only
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const teacherId = searchParams.get('teacherId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const recent = searchParams.get('recent') === 'true';
    const stats = searchParams.get('stats') === 'true';

    // Return statistics only
    if (stats) {
      const statistics = await getReviewStats();
      return NextResponse.json({ ok: true, stats: statistics });
    }

    // Filter by specific teacher
    if (teacherId) {
      const records = await getReviewRecordsByTeacherId(teacherId);
      return NextResponse.json({ 
        ok: true, 
        records,
        count: records.length,
        teacherId
      });
    }

    // Get recent reviews
    if (recent) {
      const records = await getRecentReviewRecords(limit);
      return NextResponse.json({ 
        ok: true, 
        records,
        count: records.length
      });
    }

    // Get all reviews (with optional limit)
    const { records, lastEvaluatedKey } = await getAllReviewRecords(limit);
    return NextResponse.json({ 
      ok: true, 
      records,
      count: records.length,
      lastEvaluatedKey
    });

  } catch (error: any) {
    console.error('[admin/teacher-reviews/history GET] error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to fetch review history' },
      { status: 500 }
    );
  }
}
