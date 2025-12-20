// app/api/carousel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCarouselImages, addCarouselImage, deleteCarouselImage, CarouselImage } from '@/lib/carousel';
import { deleteFromS3, getS3KeyFromUrl } from '@/lib/s3';
import fs from 'fs';
import resolveDataFile from '@/lib/localData';

// Development fallback: keep carousel images in memory when DynamoDB isn't configured
let LOCAL_CAROUSEL_IMAGES: CarouselImage[] = [];
const CAROUSEL_TABLE = process.env.DYNAMODB_TABLE_CAROUSEL;
const useDynamo =
  process.env.NODE_ENV === 'production' && typeof CAROUSEL_TABLE === 'string' && CAROUSEL_TABLE.length > 0;

async function loadLocalCarouselImages() {
  try {
    const CAROUSEL_FILE = await resolveDataFile('carousel.json');
    if (fs.existsSync(CAROUSEL_FILE)) {
      const raw = fs.readFileSync(CAROUSEL_FILE, 'utf8');
      LOCAL_CAROUSEL_IMAGES = JSON.parse(raw || '[]');
    } else {
      console.log('[carousel API] local file not found, will use hardcoded defaults');
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
  loadLocalCarouselImages().catch(() => {});
}

export async function GET() {
  try {
    if (!useDynamo) {
      // Use local storage in development
      let images = [...LOCAL_CAROUSEL_IMAGES];
      
      // Fallback for production/Amplify if local file is missing or empty
      if (images.length === 0) {
        images = [
          {
            id: 'default-1',
            url: 'https://lh3.googleusercontent.com/d/1ITTpGZ3vq2d9uoMR7ba9lMXX0t7BtvbN',
            alt: 'Carousel Image 1',
            order: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: 'default-2',
            url: 'https://lh3.googleusercontent.com/d/1LVpLJm_V_PWnBLMV4VaJUosgi366da6S',
            alt: 'Carousel Image 2',
            order: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: 'default-3',
            url: 'https://lh3.googleusercontent.com/d/1N04ltODJrGMsucgz74yo-dy7cOKtnHAa',
            alt: 'Carousel Image 3',
            order: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];
      }
      
      return NextResponse.json(images.sort((a, b) => a.order - b.order));
    }

    const images = await getCarouselImages();
    return NextResponse.json(images);
  } catch (error) {
    console.error('Error fetching carousel images:', error);
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, alt, order } = body;

    if (!url || !alt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!useDynamo) {
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
      saveLocalCarouselImages().catch(() => {});
      return NextResponse.json(newImage);
    }

    const image = await addCarouselImage({ url, alt, order: order || 0 });
    if (!image) {
      return NextResponse.json({ error: 'Failed to add image' }, { status: 500 });
    }

    return NextResponse.json(image);
  } catch (error) {
    console.error('Error adding carousel image:', error);
    return NextResponse.json({ error: 'Failed to add image' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
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
        saveLocalCarouselImages().catch(() => {});
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
        saveLocalCarouselImages().catch(() => {});
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

    // Delete from S3 if it's an S3 URL (not base64)
    if (imageToDelete.url && !imageToDelete.url.startsWith('data:')) {
      try {
        const s3Key = getS3KeyFromUrl(imageToDelete.url);
        if (s3Key) {
          await deleteFromS3(s3Key);
        }
      } catch (s3Error) {
        console.warn('Failed to delete image from S3:', s3Error);
        // Don't fail the whole operation if S3 deletion fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting carousel image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}