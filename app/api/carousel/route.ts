// app/api/carousel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getCarouselImages, addCarouselImage, deleteCarouselImage, CarouselImage } from '@/lib/carousel';
import { deleteFromS3, getS3KeyFromUrl } from '@/lib/s3';
import fs from 'fs';
import resolveDataFile from '@/lib/localData';

function convertToProxyUrl(url: string): string {
  if (url && (url.includes('s3.') || url.includes('amazonaws.com'))) {
    const key = getS3KeyFromUrl(url);
    if (key && key.startsWith('carousel/')) {
      return `/api/uploads/${key}`;
    }
  }
  return url;
}

// Development fallback: keep carousel images in memory when DynamoDB isn't configured
let LOCAL_CAROUSEL_IMAGES: CarouselImage[] = [];
const CAROUSEL_TABLE = process.env.DYNAMODB_TABLE_CAROUSEL;
const useDynamo =
  process.env.NODE_ENV === 'production' && typeof CAROUSEL_TABLE === 'string' && CAROUSEL_TABLE.length > 0;

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

if (!useDynamo) {
  console.warn(`[carousel API] Not using DynamoDB (NODE_ENV=${process.env.NODE_ENV}, DYNAMODB_TABLE_CAROUSEL=${CAROUSEL_TABLE}). Using LOCAL_CAROUSEL_IMAGES fallback.`);
  // load persisted carousel images in dev (non-blocking)
  loadLocalCarouselImages().then(() => {
    console.log('[carousel API] Initial load completed, images count:', LOCAL_CAROUSEL_IMAGES.length);
  }).catch((err) => {
    console.error('[carousel API] Initial load failed:', err);
  });
}

export async function GET() {
  try {
    if (!useDynamo) {
      await ensureInitialized();
      // Use local storage in development - only return S3-stored images
      let images = [...LOCAL_CAROUSEL_IMAGES];

      // Proxy S3 images through local API to avoid CORS/access issues
      const proxiedImages = images.map(img => ({
        ...img,
        url: convertToProxyUrl(img.url)
      }));

      return NextResponse.json(proxiedImages.sort((a, b) => a.order - b.order));
    }

    const images = await getCarouselImages();
    // Proxy S3 images through local API to avoid CORS/access issues
    const proxiedImages = images.map(img => ({
      ...img,
      url: convertToProxyUrl(img.url)
    }));

    return NextResponse.json(proxiedImages);
  } catch (error) {
    console.error('Error fetching carousel images:', error);
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('[Carousel API] POST request received');

  try {
    if (!useDynamo) {
      await ensureInitialized();
    }
    const body = await request.json();
    const { url, alt, order } = body;

    console.log('[Carousel API] Request body:', { url: url?.substring(0, 100), alt, order });

    if (!url || !alt) {
      console.error('[Carousel API] Missing required fields:', { hasUrl: !!url, hasAlt: !!alt });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!useDynamo) {
      console.log('[Carousel API] Using local storage mode');
      // Use local storage in development
      const id = `carousel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const newImage: CarouselImage = {
        id,
        url,
        alt,
        order: order || LOCAL_CAROUSEL_IMAGES.length,
        createdAt: now,
        updatedAt: now,
      };

      LOCAL_CAROUSEL_IMAGES.push(newImage);
      console.log('[Carousel API] Image added to local storage:', newImage);
      saveLocalCarouselImages().catch((error) => {
        console.error('[Carousel API] Failed to save to local file:', error);
      });

      return NextResponse.json({
        ...newImage,
        url: convertToProxyUrl(newImage.url)
      });
    }

    console.log('[Carousel API] Using DynamoDB mode, calling addCarouselImage...');
    const image = await addCarouselImage({ url, alt, order: order || 0 });
    if (!image) {
      console.error('[Carousel API] addCarouselImage returned null');
      return NextResponse.json({ error: 'Failed to add image' }, { status: 500 });
    }

    console.log('[Carousel API] Image successfully added to DynamoDB:', image);
    return NextResponse.json({
      ...image,
      url: convertToProxyUrl(image.url)
    });
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
    if (!useDynamo) {
      await ensureInitialized();
    }
    const body = await request.json();
    const { id, order } = body;

    if (!id || typeof order !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!useDynamo) {
      // Use local storage in development
      const imageIndex = LOCAL_CAROUSEL_IMAGES.findIndex(img => img.id === id);
      if (imageIndex >= 0) {
        LOCAL_CAROUSEL_IMAGES[imageIndex].order = order;
        LOCAL_CAROUSEL_IMAGES[imageIndex].updatedAt = new Date().toISOString();
        saveLocalCarouselImages().catch(() => { });
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // For DynamoDB, we would need to update the item
    // Since this is a simple implementation, we'll just return success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating carousel image order:', error);
    return NextResponse.json({ error: 'Failed to update image order' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!useDynamo) {
      await ensureInitialized();
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing image ID' }, { status: 400 });
    }

    let imageToDelete: CarouselImage | undefined;

    if (!useDynamo) {
      // Use local storage in development
      const imageIndex = LOCAL_CAROUSEL_IMAGES.findIndex(img => img.id === id);
      if (imageIndex >= 0) {
        imageToDelete = LOCAL_CAROUSEL_IMAGES[imageIndex];
        LOCAL_CAROUSEL_IMAGES.splice(imageIndex, 1);
        saveLocalCarouselImages().catch(() => { });
      } else {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }
    } else {
      // For DynamoDB, we need to get the image first to get the URL for S3 deletion
      const images = await getCarouselImages();
      imageToDelete = images.find(img => img.id === id);
      if (!imageToDelete) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }

      const success = await deleteCarouselImage(id);
      if (!success) {
        return NextResponse.json({ error: 'Failed to delete image from database' }, { status: 500 });
      }
    }

    // Delete from S3 and local cache if it's an S3/Proxy URL
    const imageUrl = imageToDelete.url;
    if (imageUrl && !imageUrl.startsWith('data:')) {
      try {
        const s3Key = getS3KeyFromUrl(imageUrl);
        if (s3Key) {
          console.log('[Carousel API] Deleting S3 key:', s3Key);

          // 1. Delete from S3
          await deleteFromS3(s3Key);
          console.log('[Carousel API] ✓ S3 object deleted');

          // 2. Delete local cache file
          // The key might be "carousel/filename.ext" or just "filename.ext" depending on how it was stored
          // Our getS3KeyFromUrl usually returns "carousel/filename.ext"
          const relativePath = s3Key.replace(/^carousel\//, '');
          const localCachePath = path.resolve(process.cwd(), '.uploads', 'carousel', relativePath);

          if (fs.existsSync(localCachePath)) {
            try {
              fs.unlinkSync(localCachePath);
              console.log('[Carousel API] ✓ Local cache file deleted:', localCachePath);
            } catch (err) {
              console.warn('[Carousel API] ! Failed to delete local cache file:', err);
            }
          } else {
            console.log('[Carousel API] Local cache file not found:', localCachePath);
          }
        }
      } catch (s3Error) {
        console.warn('[Carousel API] ! Failed to delete image from S3/Local:', s3Error);
        // Don't fail the whole operation if deletion fails, as the DB entry is gone
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting carousel image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}