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
      <div className="carousel-slide">
        {isImage ? (
          <Image
            src={slides[index]}
            alt={`Carousel slide ${index + 1}`}
            fill
            style={{ objectFit: 'cover' }}
            priority={index === 0}
          />
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
