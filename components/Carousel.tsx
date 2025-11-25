// components/Carousel.tsx
'use client';

import { useEffect, useState } from 'react';

interface CarouselProps {
  slides: string[];
  intervalMs?: number;
}

export const Carousel: React.FC<CarouselProps> = ({
  slides,
  intervalMs = 4000,
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
        <p>{slides[index]}</p>
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
