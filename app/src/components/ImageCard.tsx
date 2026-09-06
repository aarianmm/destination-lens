import { useState } from 'react';
import type { ImageCardProps } from './types.js';

/** Deterministic hash so the same seed always renders the same gradient. */
function hashSeed(seed: string): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Many destinations have no lead image — that is expected, not an error state.
 * The fallback is a deliberately designed "no photograph yet" card: a
 * seed-derived gradient, a faint compass watermark and a hairline texture, so
 * it reads as an editorial choice rather than a broken `<img>`.
 */
export function ImageCard({ image, seed, alt, className = '', children }: ImageCardProps) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(image) && !broken;
  const hash = hashSeed(seed);
  const hueA = hash % 360;
  const hueB = (hueA + 46 + (hash % 25)) % 360;
  const uid = hash.toString(36);

  return (
    <div className={`relative isolate overflow-hidden rounded-[var(--radius-panel)] ${className}`}>
      {showImage && image ? (
        <img
          src={image.url}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="absolute inset-0" aria-hidden>
          <svg width="100%" height="100%" preserveAspectRatio="none" className="absolute inset-0">
            <defs>
              <linearGradient id={`ic-${uid}-g`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={`hsl(${hueA} 48% 24%)`} />
                <stop offset="55%" stopColor={`hsl(${Math.round((hueA + hueB) / 2)} 40% 15%)`} />
                <stop offset="100%" stopColor={`hsl(${hueB} 55% 9%)`} />
              </linearGradient>
              <pattern
                id={`ic-${uid}-lines`}
                width="34"
                height="34"
                patternTransform="rotate(35)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="34" stroke="white" strokeOpacity="0.05" />
              </pattern>
              <radialGradient id={`ic-${uid}-vig`} cx="50%" cy="35%" r="75%">
                <stop offset="0%" stopColor="black" stopOpacity="0" />
                <stop offset="100%" stopColor="black" stopOpacity="0.55" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill={`url(#ic-${uid}-g)`} />
            <rect width="100%" height="100%" fill={`url(#ic-${uid}-lines)`} />
            <rect width="100%" height="100%" fill={`url(#ic-${uid}-vig)`} />
          </svg>
          <svg
            viewBox="0 0 48 48"
            className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/20"
            fill="none"
          >
            <circle cx="24" cy="24" r="19" stroke="currentColor" strokeWidth="1" />
            <path d="M24 8 L28 22 L24 40 L20 22 Z" fill="currentColor" opacity="0.7" />
            <circle cx="24" cy="24" r="2" fill="currentColor" />
          </svg>
        </div>
      )}
      {children}
    </div>
  );
}
