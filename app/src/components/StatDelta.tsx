import { formatGrowth, STATUS_COLOR } from '../lib/format.js';
import type { StatDeltaProps } from './types.js';

const SIZE_CLASS: Record<NonNullable<StatDeltaProps['size']>, string> = {
  sm: 'text-xs gap-1',
  md: 'text-sm gap-1',
  lg: 'text-2xl gap-1.5',
};

export function StatDelta({ growthPct, status, size = 'md' }: StatDeltaProps) {
  // A percentage off a near-zero baseline is arithmetically true and editorially
  // useless, so `new` destinations show their status rather than a huge number.
  const isNew = status === 'new';
  const text = isNew ? 'new signal' : formatGrowth(growthPct);
  const color = status
    ? STATUS_COLOR[status]
    : growthPct >= 0
      ? 'var(--color-emerging)'
      : 'var(--color-declining)';
  const direction = isNew || growthPct === 0 ? null : growthPct > 0 ? 'up' : 'down';

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap font-medium tabular-nums ${SIZE_CLASS[size]}`}
      style={{ color }}
    >
      {direction && (
        <svg width="0.6em" height="0.6em" viewBox="0 0 10 10" aria-hidden className="shrink-0">
          <path d={direction === 'up' ? 'M5 1 L9 8 L1 8 Z' : 'M5 9 L1 2 L9 2 Z'} fill="currentColor" />
        </svg>
      )}
      {text}
    </span>
  );
}
