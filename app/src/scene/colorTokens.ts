/**
 * three.js materials need concrete colour strings, not CSS `var(...)` references, so
 * this resolves the design tokens in `styles/tokens.css` (Agent C's file — we only
 * read it, never edit it) against the live DOM at call time. This keeps the globe's
 * palette in sync with the rest of the app instead of duplicating hex values here.
 */

const cache = new Map<string, string>();

/** Resolves `--color-emerging` (with or without the leading `--`) to its live value. */
export function cssVar(name: string): string {
  const key = name.startsWith('--') ? name : `--${name}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const value = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  const resolved = value || '#ffffff';
  cache.set(key, resolved);
  return resolved;
}

/** Same, but unwraps a `var(--x)` string as used in `STATUS_COLOR`. */
export function resolveToken(varExpr: string): string {
  const match = /var\((--[\w-]+)\)/.exec(varExpr);
  return match ? cssVar(match[1] ?? '') : varExpr;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;
  const num = Number.parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** `withAlpha('#ff9d4d', 0.4)` -> `rgba(255,157,77,0.4)`. Accepts raw hex or `var(--x)`. */
export function withAlpha(color: string, alpha: number): string {
  const hex = resolveToken(color);
  if (!hex.startsWith('#')) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
