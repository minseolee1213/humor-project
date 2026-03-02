'use client';

import { useRef, useEffect, useState } from 'react';

interface Slide {
  captionId: string;
  captionText: string | null;
  imageUrl: string | null;
  imageDescription: string | null;
}

interface PreviewRailProps {
  captions: Slide[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  votesByCaptionId: Record<string, number>;
}

const PREVIEW_COUNT = 20;

export default function PreviewRail({
  captions,
  currentIndex,
  onSelectIndex,
  votesByCaptionId,
}: PreviewRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [showLeftChevron, setShowLeftChevron] = useState(false);
  const [showRightChevron, setShowRightChevron] = useState(false);

  // Get preview items starting from currentIndex
  const previewItems = captions.slice(currentIndex, currentIndex + PREVIEW_COUNT);

  // Check scroll position to show/hide chevrons
  useEffect(() => {
    const checkScroll = () => {
      if (!railRef.current) return;
      const { scrollLeft, scrollWidth, clientWidth } = railRef.current;
      setShowLeftChevron(scrollLeft > 0);
      setShowRightChevron(scrollLeft < scrollWidth - clientWidth - 10);
    };

    const rail = railRef.current;
    if (rail) {
      rail.addEventListener('scroll', checkScroll);
      checkScroll();
    }

    return () => {
      if (rail) {
        rail.removeEventListener('scroll', checkScroll);
      }
    };
  }, [previewItems.length]);

  // Scroll to show current item when currentIndex changes
  useEffect(() => {
    if (!railRef.current) return;
    const firstItem = railRef.current.querySelector('[data-preview-index="0"]') as HTMLElement;
    if (firstItem) {
      firstItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
  }, [currentIndex]);

  const scrollRail = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const scrollAmount = railRef.current.clientWidth * 0.7;
    const newScrollLeft =
      direction === 'left'
        ? railRef.current.scrollLeft - scrollAmount
        : railRef.current.scrollLeft + scrollAmount;
    railRef.current.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
  };

  if (previewItems.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full mt-8">
      {/* Title */}
      <div className="px-6 mb-3">
        <h3
          className="text-sm sm:text-base font-semibold text-gray-200"
          style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600 }}
        >
          Continue Rating
        </h3>
      </div>

      {/* Rail container with background */}
      <div className="relative bg-black/45 backdrop-blur-sm rounded-2xl py-4">
        {/* Left chevron */}
        {showLeftChevron && (
          <button
            onClick={() => scrollRail('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110"
            aria-label="Scroll left"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Right chevron */}
        {showRightChevron && (
          <button
            onClick={() => scrollRail('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110"
            aria-label="Scroll right"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Scrollable rail */}
        <div
          ref={railRef}
          className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-6 pb-2 scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {previewItems.map((slide, idx) => {
            const actualIndex = currentIndex + idx;
            const isCurrent = idx === 0;
            const vote = votesByCaptionId[slide.captionId];
            const hasVote = vote === 1 || vote === -1;

            return (
              <div
                key={slide.captionId}
                data-preview-index={idx}
                onClick={() => onSelectIndex(actualIndex)}
                className={`
                  snap-start
                  w-[160px] sm:w-[180px]
                  aspect-video
                  rounded-xl
                  overflow-hidden
                  transition-all duration-200
                  cursor-pointer
                  flex-shrink-0
                  relative
                  group
                  ${
                    isCurrent
                      ? 'ring-2 ring-white/70 shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-105'
                      : 'hover:scale-105 hover:shadow-lg'
                  }
                `}
              >
                {/* Thumbnail image */}
                {slide.imageUrl ? (
                  <img
                    src={slide.imageUrl}
                    alt={slide.imageDescription || 'Meme preview'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-gray-500 text-xs">
                    No image
                  </div>
                )}

                {/* Vote badge */}
                {hasVote && (
                  <div
                    className={`
                      absolute top-2 left-2
                      w-7 h-7
                      rounded-full
                      flex items-center justify-center
                      text-sm
                      shadow-lg
                      backdrop-blur-sm
                      ${
                        vote === 1
                          ? 'bg-emerald-500/90 text-white'
                          : 'bg-red-500/90 text-white'
                      }
                    `}
                  >
                    {vote === 1 ? '👍' : '👎'}
                  </div>
                )}

                {/* Caption overlay on hover */}
                {slide.captionText && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-2">
                    <p
                      className="text-[10px] sm:text-xs text-white line-clamp-2"
                      style={{ fontFamily: 'var(--font-poppins)', fontWeight: 400 }}
                    >
                      {slide.captionText}
                    </p>
                  </div>
                )}

                {/* Current indicator */}
                {isCurrent && (
                  <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-white animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
