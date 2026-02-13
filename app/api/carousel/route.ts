
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

  if (!useDynamo) return null;

  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

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
    const CAROUSEL_FILE = await resolveDataFile('carousel.json');
    if (fs.existsSync(CAROUSEL_FILE)) {
      const raw = fs.readFileSync(CAROUSEL_FILE, 'utf8');
      LOCAL_CAROUSEL_IMAGES = JSON.parse(raw || '[]');
    } else {
      console.log('[carousel API] local file not found, will use S3-based defaults');
    }
  } catch (e) {
    console.warn('[carousel API] failed to load local carousel images', (e as any)?.message || e);
    LOCAL_CAROUSEL_IMAGES = [];
  }
}

async function saveLocalCarouselImages() {
  try {
    const CAROUSEL_FILE = await resolveDataFile('carousel.json');
    fs.writeFileSync(CAROUSEL_FILE, JSON.stringify(LOCAL_CAROUSEL_IMAGES, null, 2), 'utf8');
  } catch (e) {
    console.warn('[carousel API] failed to save local carousel images', (e as any)?.message || e);
  }
}

export async function GET() {
  try {
    const db = getDB();

    if (!db) {
      await ensureInitialized();
      // Use local storage in development
      let images = [...LOCAL_CAROUSEL_IMAGES];
      return NextResponse.json(images.sort((a, b) => a.order - b.order));
    }

    const { docClient, TABLE_NAME } = db;

    console.log(`[Carousel API] GET Request - Fetching from DynamoDB (Table: ${TABLE_NAME})`);
    const command = new ScanCommand({ TableName: TABLE_NAME });
    const response = await docClient.send(command);
    const items = response.Items || [];

    // Sort by order
    items.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching carousel images:', error);
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('[Carousel API] POST request received');

  try {
    const db = getDB();
    if (!db) {
      await ensureInitialized();
    }

    const body = await request.json();
    const { url, alt, order } = body;

    console.log('[Carousel API] Request body:', { url: url?.substring(0, 100), alt, order });

    if (!url || !alt) {
      console.error('[Carousel API] Missing required fields:', { hasUrl: !!url, hasAlt: !!alt });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Common Item Data
    const id = `carousel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Check if using local storage
    if (!db) {
      console.log('[Carousel API] Using local storage mode');
      const newImage: CarouselImage = {
        id,
        url,
        alt,
        order: order || LOCAL_CAROUSEL_IMAGES.length,
        createdAt: now,
        updatedAt: now,
      };

      LOCAL_CAROUSEL_IMAGES.push(newImage);
      saveLocalCarouselImages().catch((error) => {
        console.error('[Carousel API] Failed to save to local file:', error);
      });

      return NextResponse.json(newImage);
    }

    // DynamoDB Mode
    const { docClient, TABLE_NAME } = db;
    console.log('[Carousel API] Using DynamoDB mode, Executing PutCommand...');

    const newItem = {
      id,
      url,
      alt,
      order: typeof order === 'number' ? order : 0,
      createdAt: now,
      updatedAt: now,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: newItem,
    });

    await docClient.send(command);

    console.log('[Carousel API] Image successfully added to DynamoDB:', newItem);
    return NextResponse.json(newItem);

  } catch (error) {
    console.error('[Carousel API] Error adding carousel image:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json({ error: 'Failed to add image' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const db = getDB();
    if (!db) await ensureInitialized();

    const body = await request.json();
    const { id, order } = body;

    if (!id || typeof order !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!db) {
      const imageIndex = LOCAL_CAROUSEL_IMAGES.findIndex(img => img.id === id);
      if (imageIndex >= 0) {
        LOCAL_CAROUSEL_IMAGES[imageIndex].order = order;
        LOCAL_CAROUSEL_IMAGES[imageIndex].updatedAt = new Date().toISOString();
        saveLocalCarouselImages().catch(() => { });
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // For DynamoDB, we would normally update. For now returning success as per previous impl.
    // In a full implementation, we'd do an UpdateCommand here.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating carousel image order:', error);
    return NextResponse.json({ error: 'Failed to update image order' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getDB();
    if (!db) await ensureInitialized();

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing image ID' }, { status: 400 });
    }

    let imageToDelete: CarouselImage | undefined;

    if (!db) {
      // Local Storage
      const imageIndex = LOCAL_CAROUSEL_IMAGES.findIndex(img => img.id === id);
      if (imageIndex >= 0) {
        imageToDelete = LOCAL_CAROUSEL_IMAGES[imageIndex];
        LOCAL_CAROUSEL_IMAGES.splice(imageIndex, 1);
        saveLocalCarouselImages().catch(() => { });
      } else {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }
    } else {
      // DynamoDB
      const { docClient, TABLE_NAME } = db;

      // Get item first to find S3 URL
      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id }
      });

      const getResponse = await docClient.send(getCommand);
      imageToDelete = getResponse.Item as CarouselImage;

      if (!imageToDelete) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }

      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
      }));
    }

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
  } catch (error) {
    console.error('Error deleting carousel image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}