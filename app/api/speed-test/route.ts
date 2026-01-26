import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || 'small';

  let dataSize: number;
  let data: string;

  switch (size) {
    case 'large':
      dataSize = 1024 * 1024; // 1MB
      break;
    case 'medium':
      dataSize = 512 * 1024; // 512KB
      break;
    case 'small':
    default:
      dataSize = 64 * 1024; // 64KB
      break;
  }

  // Generate test data
  data = 'x'.repeat(dataSize);

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Length': dataSize.toString(),
    },
  });
}

export async function POST(request: NextRequest) {
  // Simple upload test - just acknowledge receipt
  try {
    const body = await request.text();
    return new NextResponse(JSON.stringify({
      received: body.length,
      success: true
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'Upload test failed' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}