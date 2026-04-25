import { NextResponse, NextRequest } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Query parameters
    const status = searchParams.get('status'); // PAID, COMPLETED, PENDING, REFUNDED, etc.
    const paymentMethod = searchParams.get('paymentMethod'); // stripe, paypal, linepay, etc.
    const dateFrom = searchParams.get('dateFrom'); // ISO string
    const dateTo = searchParams.get('dateTo'); // ISO string
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 500);
    const offset = Number(searchParams.get('offset')) || 0;
    const userId = searchParams.get('userId'); // Optional: filter by specific user

    // Scan all orders
    const scanRes = await ddbDocClient.send(
      new ScanCommand({
        TableName: ORDERS_TABLE,
      })
    );

    let items = scanRes.Items || [];

    // Filter by status if provided
    if (status) {
      items = items.filter((item: any) => 
        (item.status || '').toUpperCase() === status.toUpperCase()
      );
    }

    // Filter by payment method if provided
    if (paymentMethod) {
      items = items.filter((item: any) => 
        (item.paymentMethod || item.method || '').toLowerCase() === paymentMethod.toLowerCase()
      );
    }

    // Filter by date range if provided
    if (dateFrom || dateTo) {
      const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
      const toTime = dateTo ? new Date(dateTo).getTime() : Date.now();

      items = items.filter((item: any) => {
        const itemTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
        return itemTime >= fromTime && itemTime <= toTime;
      });
    }

    // Filter by userId if provided
    if (userId) {
      items = items.filter((item: any) => item.userId === userId);
    }

    // Sort by createdAt descending (newest first)
    items.sort((a: any, b: any) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    // Calculate totals
    const totalCount = items.length;
    const totalAmount = items.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    
    // Group by status
    const statusBreakdown: Record<string, { count: number; amount: number }> = {};
    items.forEach((item: any) => {
      const s = (item.status || 'UNKNOWN').toUpperCase();
      if (!statusBreakdown[s]) {
        statusBreakdown[s] = { count: 0, amount: 0 };
      }
      statusBreakdown[s].count += 1;
      statusBreakdown[s].amount += Number(item.amount) || 0;
    });

    // Group by payment method
    const methodBreakdown: Record<string, { count: number; amount: number }> = {};
    items.forEach((item: any) => {
      const m = (item.paymentMethod || item.method || 'UNKNOWN').toUpperCase();
      if (!methodBreakdown[m]) {
        methodBreakdown[m] = { count: 0, amount: 0 };
      }
      methodBreakdown[m].count += 1;
      methodBreakdown[m].amount += Number(item.amount) || 0;
    });

    // Paginate
    const paginatedItems = items.slice(offset, offset + limit);

    return NextResponse.json({
      ok: true,
      data: {
        payments: paginatedItems,
        pagination: {
          offset,
          limit,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
        summary: {
          totalAmount,
          totalCount,
          statusBreakdown,
          methodBreakdown,
        },
      },
    });
  } catch (err: any) {
    console.error('[admin/payments GET] error', err?.message || err);
    return NextResponse.json(
      { ok: false, message: 'Failed to fetch payments', error: err?.message },
      { status: 500 }
    );
  }
}
