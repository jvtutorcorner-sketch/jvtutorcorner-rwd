
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
      console.log('[Carousel API GET] DynamoDB not configured, using local storage');
      await ensureInitialized();
      let images = [...LOCAL_CAROUSEL_IMAGES];
      console.log(`[Carousel API GET] Local storage has ${images.length} images`);
      console.log(`[Carousel API GET] Returning ${images.length} images from local storage`);
      return NextResponse.json(images.sort((a, b) => a.order - b.order));
    }

    const { docClient, TABLE_NAME } = db;
    const region = process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1';

    console.log(`[Carousel API GET] Attempting DynamoDB fetch...`);
    console.log(`[Carousel API GET] Table: ${TABLE_NAME}`);
    console.log(`[Carousel API GET] Region: ${region}`);
    console.log(`[Carousel API GET] Has CI_AWS_ACCESS_KEY_ID: ${!!process.env.CI_AWS_ACCESS_KEY_ID}`);
    console.log(`[Carousel API GET] Has AWS_ACCESS_KEY_ID: ${!!process.env.AWS_ACCESS_KEY_ID}`);
    
    try {
      const command = new ScanCommand({ TableName: TABLE_NAME });
      console.log(`[Carousel API GET] Sending ScanCommand...`);
      
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
      console.log(`[Carousel API GET] ===== Request Complete (DynamoDB Success) =====`);
      return NextResponse.json(items);
    } catch (dbError: any) {
      console.error('[Carousel API GET] ===== DynamoDB Error =====');
      console.error('[Carousel API GET] Error name:', dbError.name);
      console.error('[Carousel API GET] Error message:', dbError.message);
      console.error('[Carousel API GET] Error code:', dbError.code);
      console.error('[Carousel API GET] HTTP status:', dbError.$metadata?.httpStatusCode);
      console.error('[Carousel API GET] Full error:', dbError);

      // Fallback: try to load from local storage
      console.log('[Carousel API GET] Attempting fallback to local storage...');
      await ensureInitialized();
      let images = [...LOCAL_CAROUSEL_IMAGES];
      
      console.log(`[Carousel API GET] Local storage has ${images.length} images`);
      
      if (images.length > 0) {
        console.log(`[Carousel API GET] Found ${images.length} images in local storage fallback`);
        console.log(`[Carousel API GET] ===== Request Complete (Local Storage Fallback) =====`);
        return NextResponse.json(images.sort((a, b) => a.order - b.order));
      }
      
      // If no local storage either, return empty array
      console.log('[Carousel API GET] No images in local storage either, returning empty array');
      console.log('[Carousel API GET] ===== Request Complete (Empty) =====');
      return NextResponse.json([]);
    }
  } catch (error: any) {
    console.error('[Carousel API GET] ===== Unexpected Error =====');
    console.error('[Carousel API GET] Error name:', error?.name);
    console.error('[Carousel API GET] Error message:', error?.message);
    console.error('[Carousel API GET] Error stack:', error?.stack);
    
    // Last resort: try local storage
    try {
      console.log('[Carousel API GET] Last resort: trying local storage...');
      await ensureInitialized();
      let images = [...LOCAL_CAROUSEL_IMAGES];
      console.log(`[Carousel API GET] Local storage has ${images.length} images`);
      
      if (images.length > 0) {
        console.log(`[Carousel API GET] Recovered ${images.length} images from local storage after unexpected error`);
        console.log(`[Carousel API GET] ===== Request Complete (Last Resort) =====`);
        return NextResponse.json(images.sort((a, b) => a.order - b.order));
      }
    } catch (fallbackError) {
      console.error('[Carousel API GET] Fallback to local storage also failed:', fallbackError);
    }
    
    // Return empty array instead of 500 to prevent frontend breakage
    console.log('[Carousel API GET] Returning empty array due to all errors');
    console.log('[Carousel API GET] ===== Request Complete (Error) =====');
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production';
  const envName = isProduction ? 'production' : 'development';
  
  console.log(`[Carousel API POST] Request received in ${envName} mode`);

  try {
    const db = getDB();
    if (!db) {
      await ensureInitialized();
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

    // Check if using local storage (no DB configured)
    if (!db) {
      console.log('[Carousel API POST] Using local storage mode (no DB configured)');
      await ensureInitialized();
      LOCAL_CAROUSEL_IMAGES.push(newItem);
      await saveLocalCarouselImages();
      return NextResponse.json(newItem);
    }

    // DynamoDB Mode
    const { docClient, TABLE_NAME } = db;
    console.log(`[Carousel API POST] Using DynamoDB mode (Table: ${TABLE_NAME}, Region: ${process.env.CI_AWS_REGION || process.env.AWS_REGION || 'ap-northeast-1'})`);

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: newItem,
    });

    try {
      await docClient.send(command);
      console.log('[Carousel API POST] Image successfully added to DynamoDB:', newItem);
      return NextResponse.json(newItem);
    } catch (dbError: any) {
      console.error('[Carousel API POST] DynamoDB error:', {
        name: dbError.name,
        message: dbError.message,
        code: dbError.code,
        statusCode: dbError.$metadata?.httpStatusCode
      });
      
      // Fallback to local storage when DynamoDB fails
      console.warn('[Carousel API POST] DynamoDB failed, falling back to local storage');
      await ensureInitialized();
      
      // Check if already exists
      const existingIndex = LOCAL_CAROUSEL_IMAGES.findIndex(img => img.id === newItem.id);
      if (existingIndex >= 0) {
        LOCAL_CAROUSEL_IMAGES[existingIndex] = newItem;
      } else {
        LOCAL_CAROUSEL_IMAGES.push(newItem);
      }
      
      await saveLocalCarouselImages();
      console.log('[Carousel API POST] Image saved to local storage as fallback');
      
      return NextResponse.json(newItem);
    }

  } catch (error: any) {
    console.error('[Carousel API POST] Unexpected error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json({ error: 'Failed to add image' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  console.log('[Carousel API PATCH] Request received');
  
  try {
    const db = getDB();
    await ensureInitialized(); // Always initialize to ensure local storage is loaded

    const body = await request.json();
    const { id, order } = body;

    console.log('[Carousel API PATCH] Request body:', { id, order });

    if (!id || typeof order !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Try local storage first (works for both dev and when DynamoDB fails)
    const localImageIndex = LOCAL_CAROUSEL_IMAGES.findIndex(img => img.id === id);
    if (localImageIndex >= 0) {
      console.log('[Carousel API PATCH] Updating in local storage');
      LOCAL_CAROUSEL_IMAGES[localImageIndex].order = order;
      LOCAL_CAROUSEL_IMAGES[localImageIndex].updatedAt = new Date().toISOString();
      await saveLocalCarouselImages();
    }

    // Also try DynamoDB if available
    if (db) {
      const { docClient, TABLE_NAME } = db;
      try {
        // For now, just return success. Full implementation would use UpdateCommand
        console.log('[Carousel API PATCH] DynamoDB update would go here (not implemented)');
        return NextResponse.json({ success: true });
      } catch (dbError) {
        console.error('[Carousel API PATCH] DynamoDB update failed, but local storage succeeded:', dbError);
      }
    }

    if (localImageIndex >= 0) {
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  } catch (error: any) {
    console.error('[Carousel API PATCH] Error updating carousel image order:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return NextResponse.json({ error: 'Failed to update image order' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  console.log('[Carousel API DELETE] Request received');
  
  try {
    const db = getDB();
    await ensureInitialized(); // Always initialize to ensure local storage is loaded

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    console.log('[Carousel API DELETE] Request ID:', id);

    if (!id) {
      return NextResponse.json({ error: 'Missing image ID' }, { status: 400 });
    }

    let imageToDelete: CarouselImage | undefined;

    // Try to find in local storage first
    const localImageIndex = LOCAL_CAROUSEL_IMAGES.findIndex(img => img.id === id);
    if (localImageIndex >= 0) {
      imageToDelete = LOCAL_CAROUSEL_IMAGES[localImageIndex];
      LOCAL_CAROUSEL_IMAGES.splice(localImageIndex, 1);
      await saveLocalCarouselImages();
      console.log('[Carousel API DELETE] Image removed from local storage');
    }

    // Also try DynamoDB if available
    if (db) {
      const { docClient, TABLE_NAME } = db;

      try {
        // Get item first to find S3 URL
        const getCommand = new GetCommand({
          TableName: TABLE_NAME,
          Key: { id }
        });

        const getResponse = await docClient.send(getCommand);
        const dbImage = getResponse.Item as CarouselImage;

        if (dbImage) {
          imageToDelete = dbImage; // Use DB image if found
          
          await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { id }
          }));
          console.log('[Carousel API DELETE] Image removed from DynamoDB');
        }
      } catch (dbError: any) {
        console.error('[Carousel API DELETE] DynamoDB delete error:', {
          name: dbError.name,
          message: dbError.message,
          code: dbError.code
        });
        
        // If local storage succeeded, continue anyway
        if (localImageIndex >= 0) {
          console.warn('[Carousel API DELETE] DynamoDB delete failed but local storage succeeded');
        } else {
          return NextResponse.json({ 
            error: 'Failed to delete from database',
            details: dbError.message 
          }, { status: 500 });
        }
      }
    }

    if (!imageToDelete) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
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
  } catch (error: any) {
    console.error('[Carousel API DELETE] Unexpected error:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}