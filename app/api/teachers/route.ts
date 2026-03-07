import { NextResponse } from 'next/server';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '@/lib/dynamo';
import { TEACHERS } from '@/data/teachers';

const TEACHERS_TABLE = process.env.DYNAMODB_TABLE_TEACHERS || 'jvtutorcorner-teachers';

export async function GET() {
    try {
        const scanCmd = new ScanCommand({ TableName: TEACHERS_TABLE });
        const result = await ddbDocClient.send(scanCmd);

        // Deduplicate and process
        const rawTeachers = result.Items || [];
        const uniqueMap = new Map();

        // Sort by updatedAt if available, or just use ID
        rawTeachers.sort((a, b) => (new Date(a.updatedAt || 0).getTime()) - (new Date(b.updatedAt || 0).getTime()));

        rawTeachers.forEach(t => {
            const id = t.id || t.roid_id;
            if (id) uniqueMap.set(id, t);
        });

        let teachers = Array.from(uniqueMap.values());

        // Fallback to static data if DB is empty
        if (teachers.length === 0) {
            teachers = TEACHERS;
        }

        return NextResponse.json({ ok: true, teachers });
    } catch (err: any) {
        console.error('[GET /api/teachers] error:', err);
        return NextResponse.json({ ok: false, message: err?.message || 'Failed to fetch teachers' }, { status: 500 });
    }
}
