import { NextResponse } from 'next/server';
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

const ORDERS_TABLE = process.env.DYNAMODB_TABLE_ORDERS || 'jvtutorcorner-orders';
const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';
const PROFILES_TABLE = process.env.DYNAMODB_TABLE_PROFILES || 'jvtutorcorner-profiles';

export async function GET() {
    try {
        // 1. Fetch Orders stats
        const ordersRes = await ddbDocClient.send(new ScanCommand({ TableName: ORDERS_TABLE }));
        const orders = ordersRes.Items || [];
        const revenue = orders.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
        const pendingOrders = orders.filter((o: any) => o.status === 'PENDING').length;

        // 2. Fetch Teacher count
        const teachersRes = await ddbDocClient.send(new ScanCommand({ TableName: TEACHERS_TABLE, Select: 'COUNT' }));
        const teacherCount = teachersRes.Count || 0;

        // 3. Fetch Profile (User) count
        const profilesRes = await ddbDocClient.send(new ScanCommand({ TableName: PROFILES_TABLE, Select: 'COUNT' }));
        const profileCount = profilesRes.Count || 0;

        return NextResponse.json({
            ok: true,
            stats: {
                revenue,
                orderCount: orders.length,
                pendingOrders,
                teacherCount,
                profileCount
            }
        });
    } catch (err: any) {
        console.error('[admin/stats GET] error', err?.message || err);
        return NextResponse.json({ ok: false, message: 'Failed to fetch stats' }, { status: 500 });
    }
}
