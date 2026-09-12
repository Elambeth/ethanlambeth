"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type CarouselImage = {
  src: string;
  alt: string;
  label: string;
};

export default function ImageCarousel({ images }: { images: CarouselImage[] }) {
  const [index, setIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(
    () => () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    []
  );

  if (images.length === 0) return null;

  return (
    <section
      className="not-prose my-8 max-w-2xl"
      aria-roledescription="carousel"
      aria-label="Advertising layers"
    >
      <div
        ref={viewportRef}
        className="aspect-[8/7] overflow-x-auto overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        tabIndex={0}
        onScroll={() => {
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          animationFrameRef.current = requestAnimationFrame(() => {
            const viewport = viewportRef.current;
            if (!viewport) return;
            const slideStep = viewport.clientWidth * 0.875 + 12;
            const nextIndex = Math.round(viewport.scrollLeft / slideStep);
            setIndex(Math.max(0, Math.min(nextIndex, images.length - 1)));
          });
        }}
      >
        <div className="flex h-full gap-3">
          {images.map((image, imageIndex) => {
            const isLastImage = imageIndex === images.length - 1;
            return (
              <article
                key={image.src}
                className={`relative h-full shrink-0 snap-start overflow-hidden rounded-md ${
                  isLastImage ? "basis-full" : "basis-[87.5%]"
                }`}
                role="group"
                aria-label={`${image.label}, image ${imageIndex + 1} of ${images.length}`}
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  priority={imageIndex === 0}
                  sizes={
                    isLastImage
                      ? "(min-width: 1024px) 672px, calc(100vw - 3rem)"
                      : "(min-width: 1024px) 588px, 77vw"
                  }
                  className="select-none object-cover"
                  draggable={false}
                />
                <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <p className="absolute bottom-6 left-6 right-6 m-0 text-3xl font-bold leading-none tracking-tight text-white drop-shadow-sm sm:bottom-8 sm:left-8 sm:text-4xl">
                  {image.label}
                </p>
              </article>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {images[index].label}, image {index + 1} of {images.length}
      </p>

      <div className="mt-3 flex items-center justify-center gap-2" aria-hidden>
        {images.map((image, imageIndex) => (
          <span
            key={image.src}
            className={`size-1.5 rounded-full ${
              imageIndex === index ? "bg-foreground" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
