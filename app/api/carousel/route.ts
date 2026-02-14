
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { deleteFromS3, getS3KeyFromUrl } from '@/lib/s3';
import { CarouselImage } from '@/lib/carousel'; // Type only
import path from 'path';
import fs from 'fs';
import resolveDataFile from '@/lib/localData';

// 強制動態執行，避免被 Next.js 快取
export const dynamic = 'force-dynamic';

// Helper to get DB client
function getDB() {
  // 檢查所有可能的 Region 變數來源
  const REGION = process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1';
  // 檢查 Table 名稱變數
  const TABLE_NAME = process.env.DYNAMODB_TABLE_CAROUSEL || 'jvtutorcorner-carousel';

  // Use DynamoDB in production OR if table name is explicitly set
  const useDynamo = process.env.NODE_ENV === 'production' || !!process.env.DYNAMODB_TABLE_CAROUSEL;

  console.log('[Carousel getDB] Configuration check:', {
    NODE_ENV: process.env.NODE_ENV,
    DYNAMODB_TABLE_CAROUSEL: process.env.DYNAMODB_TABLE_CAROUSEL,
    useDynamo,
    REGION,
    TABLE_NAME,
    hasCiAccessKey: !!process.env.CI_AWS_ACCESS_KEY_ID,
    hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID
  });

  if (!useDynamo) {
    console.log('[Carousel getDB] Not using DynamoDB (dev mode without explicit table config)');
    return null;
  }

  console.log('[Carousel getDB] Creating DynamoDB client...');
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('[Carousel getDB] DynamoDB client created');
  return { docClient, TABLE_NAME };
}

// Development fallback globals
let LOCAL_CAROUSEL_IMAGES: CarouselImage[] = [];
let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function ensureInitialized() {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = loadLocalCarouselImages();
  }
  await initPromise;
  isInitialized = true;
}

async function loadLocalCarouselImages() {
  try {
    console.log('[Carousel loadLocal] Starting to load local carousel images...');
    const CAROUSEL_FILE = await resolveDataFile('carousel.json');
    console.log('[Carousel loadLocal] Carousel file path:', CAROUSEL_FILE);
    
    if (fs.existsSync(CAROUSEL_FILE)) {
      console.log('[Carousel loadLocal] File exists, reading...');
      const raw = fs.readFileSync(CAROUSEL_FILE, 'utf8');
      console.log('[Carousel loadLocal] File content length:', raw.length);
      
      LOCAL_CAROUSEL_IMAGES = JSON.parse(raw || '[]');
      console.log(`[Carousel loadLocal] Successfully loaded ${LOCAL_CAROUSEL_IMAGES.length} images from local file`);
      
      if (LOCAL_CAROUSEL_IMAGES.length > 0) {
        console.log('[Carousel loadLocal] First image:', {
          id: LOCAL_CAROUSEL_IMAGES[0].id,
          url: LOCAL_CAROUSEL_IMAGES[0].url?.substring(0, 50),
          alt: LOCAL_CAROUSEL_IMAGES[0].alt
        });
      }
    } else {
      console.log('[Carousel loadLocal] File does not exist at:', CAROUSEL_FILE);
      LOCAL_CAROUSEL_IMAGES = [];
    }
  } catch (e) {
    console.error('[Carousel loadLocal] Failed to load:', (e as any)?.message || e);
    console.error('[Carousel loadLocal] Full error:', e);
    LOCAL_CAROUSEL_IMAGES = [];
  }
}

async function saveLocalCarouselImages() {
  try {
    console.log(`[Carousel saveLocal] Saving ${LOCAL_CAROUSEL_IMAGES.length} images to local file...`);
    const CAROUSEL_FILE = await resolveDataFile('carousel.json');
    console.log('[Carousel saveLocal] Target file path:', CAROUSEL_FILE);
    
    const jsonContent = JSON.stringify(LOCAL_CAROUSEL_IMAGES, null, 2);
    console.log('[Carousel saveLocal] JSON content length:', jsonContent.length);
    
    fs.writeFileSync(CAROUSEL_FILE, jsonContent, 'utf8');
    console.log('[Carousel saveLocal] File saved successfully');
  } catch (e) {
    console.error('[Carousel saveLocal] Failed to save:', (e as any)?.message || e);
    console.error('[Carousel saveLocal] Full error:', e);
  }
}

export async function GET() {
  const isProduction = process.env.NODE_ENV === 'production';
  const envName = isProduction ? 'production' : 'development';
  
  console.log(`[Carousel API GET] ===== Request Start =====`);
  console.log(`[Carousel API GET] Environment: ${envName}`);
  console.log(`[Carousel API GET] NODE_ENV: ${process.env.NODE_ENV}`);
  
  try {
    const db = getDB();
    
    console.log(`[Carousel API GET] DB configured: ${!!db}`);

    if (!db) {
      console.log('[Carousel API GET] ERROR: DynamoDB not configured in production mode!');
      return NextResponse.json(
        { error: 'DynamoDB not configured', data: [] },
        { status: 500 }
      );
    }

    const { docClient, TABLE_NAME } = db;
    const region = process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1';

    console.log(`[Carousel API GET] Using DynamoDB`);
    console.log(`[Carousel API GET] Table: ${TABLE_NAME}`);
    console.log(`[Carousel API GET] Region: ${region}`);
    console.log(`[Carousel API GET] Has CI_AWS_ACCESS_KEY_ID: ${!!process.env.CI_AWS_ACCESS_KEY_ID}`);
    console.log(`[Carousel API GET] Has AWS_ACCESS_KEY_ID: ${!!process.env.AWS_ACCESS_KEY_ID}`);
    
    const command = new ScanCommand({ TableName: TABLE_NAME });
    console.log(`[Carousel API GET] Sending ScanCommand to DynamoDB...`);
    
    const response = await docClient.send(command);
    console.log(`[Carousel API GET] DynamoDB response received`);
    console.log(`[Carousel API GET] Response has Items: ${!!response.Items}`);
    
    const items = response.Items || [];
    console.log(`[Carousel API GET] Items count: ${items.length}`);
    
    if (items.length > 0) {
      console.log(`[Carousel API GET] First item sample:`, {
        id: items[0].id,
        url: items[0].url?.substring(0, 50),
        alt: items[0].alt,
        order: items[0].order
      });
    }

    // Sort by order
    items.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    console.log(`[Carousel API GET] Successfully fetched ${items.length} images from DynamoDB`);
    console.log(`[Carousel API GET] ===== Request Complete =====`);
    return NextResponse.json(items);
  } catch (error: any) {
    console.error('[Carousel API GET] ===== Error =====');
    console.error('[Carousel API GET] Error name:', error?.name);
    console.error('[Carousel API GET] Error message:', error?.message);
    console.error('[Carousel API GET] Error code:', error?.code);
    console.error('[Carousel API GET] Error stack:', error?.stack);
    console.error('[Carousel API GET] Full error:', error);
    
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch carousel images' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production';
  const envName = isProduction ? 'production' : 'development';
  
  console.log(`[Carousel API POST] Request received in ${envName} mode`);

  try {
    const db = getDB();
    if (!db) {
      console.error('[Carousel API POST] ERROR: DynamoDB not configured!');
      return NextResponse.json(
        { error: 'DynamoDB not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { url, alt, order } = body;

    console.log('[Carousel API POST] Request body:', { url: url?.substring(0, 100), alt, order });

    if (!url || !alt) {
      console.error('[Carousel API POST] Missing required fields:', { hasUrl: !!url, hasAlt: !!alt });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Common Item Data
    const id = `carousel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const newItem: CarouselImage = {
      id,
      url,
      alt,
      order: typeof order === 'number' ? order : 0,
      createdAt: now,
      updatedAt: now,
    };

    // DynamoDB Mode (required)
    const { docClient, TABLE_NAME } = db;
    console.log(`[Carousel API POST] Using DynamoDB (Table: ${TABLE_NAME}, Region: ${process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1'})`);

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: newItem,
    });

    await docClient.send(command);
    console.log('[Carousel API POST] Image successfully added to DynamoDB:', newItem);
    return NextResponse.json(newItem);

  } catch (error: any) {
    console.error('[Carousel API POST] Error:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      statusCode: error?.$metadata?.httpStatusCode,
      stack: error?.stack
    });
    return NextResponse.json(
      { error: error?.message || 'Failed to add image' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  console.log('[Carousel API PATCH] Request received');
  
  try {
    const db = getDB();
    
    if (!db) {
      console.error('[Carousel API PATCH] ERROR: DynamoDB not configured!');
      return NextResponse.json(
        { error: 'DynamoDB not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, order } = body;

    console.log('[Carousel API PATCH] Request body:', { id, order });

    if (!id || typeof order !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Use DynamoDB UpdateCommand
    const { docClient, TABLE_NAME } = db;
    
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        id,
        order,
        updatedAt: new Date().toISOString(),
      },
    });

    await docClient.send(command);
    console.log('[Carousel API PATCH] Image order updated in DynamoDB');
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Carousel API PATCH] Error:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    return NextResponse.json(
      { error: error?.message || 'Failed to update image order' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  console.log('[Carousel API DELETE] Request received');
  
  try {
    const db = getDB();
    
    if (!db) {
      console.error('[Carousel API DELETE] ERROR: DynamoDB not configured!');
      return NextResponse.json(
        { error: 'DynamoDB not configured' },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    console.log('[Carousel API DELETE] Request ID:', id);

    if (!id) {
      return NextResponse.json({ error: 'Missing image ID' }, { status: 400 });
    }

    const { docClient, TABLE_NAME } = db;

    // Get item first to find S3 URL
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id }
    });

    const getResponse = await docClient.send(getCommand);
    const imageToDelete = getResponse.Item as CarouselImage;

    if (!imageToDelete) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Delete from DynamoDB
    const deleteCommand = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id }
    });

    await docClient.send(deleteCommand);
    console.log('[Carousel API DELETE] Image removed from DynamoDB');

    // Delete S3 Object
    const imageUrl = imageToDelete.url;
    if (imageUrl && !imageUrl.startsWith('data:')) {
      try {
        const s3Key = getS3KeyFromUrl(imageUrl);
        if (s3Key) {
          console.log('[Carousel API] Deleting S3 key:', s3Key);
          await deleteFromS3(s3Key);

          // Try cleanup local cache if exists
          const relativePath = s3Key.replace(/^carousel\//, '');
          const localCachePath = path.resolve(process.cwd(), '.uploads', 'carousel', relativePath);
          if (fs.existsSync(localCachePath)) {
            try { fs.unlinkSync(localCachePath); } catch (e) { }
          }
        }
      } catch (s3Error) {
        console.warn('[Carousel API] ! Failed to delete image from S3/Local:', s3Error);
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[Carousel API DELETE] Error:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    return NextResponse.json(
      { error: error?.message || 'Failed to delete image' },
      { status: 500 }
    );
  }
}