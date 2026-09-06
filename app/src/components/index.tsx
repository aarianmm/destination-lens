/**
 * STUB IMPLEMENTATIONS — Agent C replaces the bodies, keeping the prop contract
 * in `types.ts` intact. They are deliberately plain but functional, so Agents A
 * and B can build complete screens against them from the first hour.
 */
import { formatGrowth, STATUS_COLOR, STATUS_LABEL } from '../lib/format.js';
import type {
  ErrorStateProps,
  FlagChipProps,
  ImageCardProps,
  LoadingProps,
  PanelProps,
  QuoteCardProps,
  SparklineProps,
  StatDeltaProps,
  StatusBadgeProps,
} from './types.js';

export function Panel({ children, className = '', solid }: PanelProps) {
  return (
    <div
      className={`rounded-[var(--radius-panel)] border border-[var(--color-hairline)] ${
        solid ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-surface)]/80 backdrop-blur'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
        size === 'sm' ? 'text-[10px]' : 'text-xs'
      }`}
      style={{ color: STATUS_COLOR[status], borderColor: 'var(--color-hairline)' }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Sparkline({ values, status, width = 96, height = 24 }: SparklineProps) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / max) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={status ? STATUS_COLOR[status] : 'var(--color-ink-muted)'}
        strokeWidth={1.25}
      />
    </svg>
  );
}

export function StatDelta({ growthPct, status, size = 'md' }: StatDeltaProps) {
  // A percentage off a near-zero baseline is arithmetically true and editorially
  // useless, so `new` destinations show their status rather than a huge number.
  const text = status === 'new' ? 'new signal' : formatGrowth(growthPct);
  const cls = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <span
      className={cls}
      style={{ color: growthPct >= 0 ? 'var(--color-emerging)' : 'var(--color-declining)' }}
    >
      {text}
    </span>
  );
}

export function FlagChip({ iso2, name, basis, trend }: FlagChipProps) {
  const flag = iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)]"
      title={basis === 'social' ? 'Inferred from public posts' : 'From the flight route network'}
    >
      <span aria-hidden>{flag}</span>
      {name && <span>{name}</span>}
      {trend && <span aria-hidden>{trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}</span>}
    </span>
  );
}

export function QuoteCard({ text, url }: QuoteCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-[var(--color-hairline)] p-3 text-sm text-[var(--color-ink)] hover:border-[var(--color-ink-faint)]"
    >
      “{text}”
    </a>
  );
}

export function ImageCard({ image, seed, alt, className = '', children }: ImageCardProps) {
  const hue = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-panel)] ${className}`}>
      {image ? (
        <img src={image.url} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div
          className="h-full w-full"
          style={{
            background: `linear-gradient(140deg, hsl(${hue},45%,26%), hsl(${(hue + 40) % 360},50%,12%))`,
          }}
          aria-hidden
        />
      )}
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading' }: LoadingProps) {
  return (
    <p className="text-sm text-[var(--color-ink-faint)]" role="status">
      {label}…
    </p>
  );
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="text-sm text-[var(--color-ink-muted)]" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 underline hover:text-[var(--color-ink)]">
          Try again
        </button>
      )}
    </div>
  );
}
