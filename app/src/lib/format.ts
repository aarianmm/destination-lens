import type { DestinationStatus } from '@dl/shared';

/** +84% / −31% / — . Uses a true minus sign; growth is already a percentage. */
export function formatGrowth(growthPct: number): string {
  if (!Number.isFinite(growthPct)) return '—';
  const rounded = Math.round(growthPct);
  if (rounded === 0) return 'flat';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

export const STATUS_LABEL: Record<DestinationStatus, string> = {
  emerging: 'Emerging',
  new: 'New signal',
  established: 'Established',
  declining: 'Cooling',
  quiet: 'Quiet',
};

/** CSS custom property holding this status's accent colour. */
export const STATUS_COLOR: Record<DestinationStatus, string> = {
  emerging: 'var(--color-emerging)',
  new: 'var(--color-new)',
  established: 'var(--color-established)',
  declining: 'var(--color-declining)',
  quiet: 'var(--color-quiet)',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
