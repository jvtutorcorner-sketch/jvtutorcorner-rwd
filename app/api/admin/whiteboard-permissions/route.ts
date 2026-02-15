import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

type WhiteboardPermission = {
  roleId: string;
  roleName: string;
  pen: boolean;
  erase: boolean;
  clear: boolean;
  pdf: boolean;
};

// DynamoDB 配置
const PERMISSIONS_TABLE = process.env.DYNAMODB_TABLE_WHITEBOARD_PERMISSIONS || 'jvtutorcorner-whiteboard-permissions';
const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
const clientConfig: any = { region };

// 只有在真的有 Access Key 時才設定 credentials
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;

if (accessKeyId && secretAccessKey) {
  clientConfig.credentials = { accessKeyId, secretAccessKey };
}

const client = new DynamoDBClient(clientConfig);
const ddbDocClient = DynamoDBDocumentClient.from(client);

/**
 * GET /api/admin/whiteboard-permissions
 * 獲取所有白板權限設定
 */
export async function GET(request: NextRequest) {
  console.log('[Whiteboard Permissions API] GET - 開始獲取白板權限設定');

  if (!PERMISSIONS_TABLE) {
    console.warn('[Whiteboard Permissions API] DYNAMODB_TABLE_WHITEBOARD_PERMISSIONS 未設定');
    return NextResponse.json({
      ok: false,
      error: 'DynamoDB table not configured',
      permissions: []
    }, { status: 500 });
  }

  try {
    const scanRes = await ddbDocClient.send(new ScanCommand({
      TableName: PERMISSIONS_TABLE
    }));

    const permissions = (scanRes.Items || []) as WhiteboardPermission[];
    console.log(`[Whiteboard Permissions API] ✅ 成功獲取 ${permissions.length} 個權限設定`);

    return NextResponse.json({
      ok: true,
      permissions
    });
  } catch (e: any) {
    console.error('[Whiteboard Permissions API] ❌ 獲取權限失敗:', e.message);
    return NextResponse.json({
      ok: false,
      error: e.message,
      permissions: []
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/whiteboard-permissions
 * 保存白板權限設定
 */
export async function POST(request: NextRequest) {
  console.log('[Whiteboard Permissions API] POST - 開始保存白板權限設定');
  console.log('[Whiteboard Permissions API] 使用表名:', PERMISSIONS_TABLE);

  if (!PERMISSIONS_TABLE) {
    console.warn('[Whiteboard Permissions API] DYNAMODB_TABLE_WHITEBOARD_PERMISSIONS 未設定');
    return NextResponse.json({
      ok: false,
      error: 'DynamoDB table not configured'
    }, { status: 500 });
  }

  try {
    const body = await request.json();
    const permissions = body.permissions || [];

    console.log(`[Whiteboard Permissions API] 保存 ${permissions.length} 個權限設定`);

    // Validate permissions
    for (const perm of permissions) {
      if (!perm.roleId || !perm.roleName) {
        console.error('[Whiteboard Permissions API] ❌ 無效的權限資料:', perm);
        return NextResponse.json({
          ok: false,
          error: 'Invalid permission: missing roleId or roleName'
        }, { status: 400 });
      }
    }

    // Write new permissions directly (PutRequest will overwrite existing items)
    console.log('[Whiteboard Permissions API] ✍️  寫入新的權限設定...');
    const putRequests = permissions.map((perm: WhiteboardPermission) => ({
      PutRequest: { Item: perm }
    }));

    const chunkSize = 25;
    for (let i = 0; i < putRequests.length; i += chunkSize) {
      const chunk = putRequests.slice(i, i + chunkSize);
      const batchIndex = Math.floor(i / chunkSize) + 1;
      console.log(`[Whiteboard Permissions API] 寫入批次 ${batchIndex}，共 ${chunk.length} 項...`);
      
      try {
        const result = await ddbDocClient.send(new BatchWriteCommand({
          RequestItems: {
            [PERMISSIONS_TABLE]: chunk
          }
        }));
        console.log(`[Whiteboard Permissions API] ✅ 批次 ${batchIndex} 成功`);
      } catch (batchErr: any) {
        console.error(`[Whiteboard Permissions API] ❌ 批次 ${batchIndex} 失敗:`, batchErr.message);
        throw batchErr;
      }
    }

    console.log(`[Whiteboard Permissions API] ✅ 成功保存 ${permissions.length} 個權限設定`);

    return NextResponse.json({
      ok: true,
      permissions
    });
  } catch (e: any) {
    console.error('[Whiteboard Permissions API] ❌ 保存權限失敗:', e.message);
    console.error('[Whiteboard Permissions API] 完整錯誤:', e);
    return NextResponse.json({
      ok: false,
      error: e.message,
      details: e.toString()
    }, { status: 500 });
  }
}
