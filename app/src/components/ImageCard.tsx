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
/**
 * Fixture snapshots carry a tiny inline SVG gradient as their "image". It is not
 * a photograph — it renders as an empty wash — so it counts as no image at all,
 * and the flag-and-name placeholder is drawn instead.
 */
const isRealPhoto = (url: string | undefined): boolean => !!url && !url.startsWith('data:');

/** iso2 -> regional-indicator flag emoji. Same derivation as FlagChip. */
const flagFor = (iso2: string) =>
  iso2
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

export function ImageCard({
  image,
  seed,
  alt,
  className = '',
  children,
  countryIso2,
  showPlaceholderLabel = true,
}: ImageCardProps) {
  const [broken, setBroken] = useState(false);
  const showImage = isRealPhoto(image?.url) && !broken;
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
          {/* Sized in container units so the same component reads well as a
              small card and as a wide hero without callers tuning type scales. */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-[3cqi] p-4"
            style={{ containerType: 'inline-size' }}
          >
            {countryIso2 && (
              <span
                className="leading-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
                style={{ fontSize: 'clamp(1.75rem, 22cqi, 5.5rem)' }}
              >
                {flagFor(countryIso2)}
              </span>
            )}
            {showPlaceholderLabel && (
              <span
                className="text-center font-display leading-none text-white/75"
                style={{ fontSize: 'clamp(1.15rem, 11cqi, 3rem)' }}
              >
                {alt}
              </span>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
