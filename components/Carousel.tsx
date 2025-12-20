// components/Carousel.tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface CarouselProps {
  slides: string[];
  intervalMs?: number;
  isImage?: boolean;
}

export const Carousel: React.FC<CarouselProps> = ({
  slides,
  intervalMs = 4000,
  isImage = false,
}) => {
  const [index, setIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (slides.length <= 1) return;

    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, intervalMs);

    return () => clearInterval(id);
  }, [slides, intervalMs]);

  if (slides.length === 0) return null;

  return (
    <div className="carousel">
      <div className="carousel-slide" style={{ background: '#f3f4f6' }}>
        {isImage ? (
          <>
            {!loadedImages[index] && (
              <div className="carousel-loading">
                <div className="spinner"></div>
              </div>
            )}
            <Image
              src={slides[index]}
              alt={`Carousel slide ${index + 1}`}
              fill
              style={{ 
                objectFit: 'cover',
                opacity: loadedImages[index] ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out'
              }}
              priority={index === 0}
              unoptimized={slides[index].includes('googleusercontent.com') || slides[index].includes('drive.google.com')}
              onLoad={() => setLoadedImages(prev => ({ ...prev, [index]: true }))}
            />
          </>
        ) : (
          <p>{slides[index]}</p>
        )}
      </div>
      <div className="carousel-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            className={i === index ? 'active' : ''}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
};
