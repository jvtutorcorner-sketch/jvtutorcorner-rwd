// app/page.tsx
import { getCarouselImages } from '@/lib/carousel-db';
import ClientHomePage from './ClientHomePage';

// This is a Server Component
export const dynamic = 'force-dynamic'; // Ensure we fetch fresh data on each request

export default async function HomePage() {
  // Fetch data directly on the server
  const images = await getCarouselImages();
  const imageUrls = images.map(img => img.url);

  console.log('[HomePage Server] Fetched images:', imageUrls.length);

  return <ClientHomePage initialCarouselImages={imageUrls} />;
}
