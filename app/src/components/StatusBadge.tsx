import { STATUS_COLOR, STATUS_LABEL } from '../lib/format.js';
import type { StatusBadgeProps } from './types.js';

/** Statuses worth a living, pulsing dot — the ones representing movement. */
const PULSES: Partial<Record<StatusBadgeProps['status'], true>> = { emerging: true, new: true };

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 38%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
        {PULSES[status] && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden"
            style={{ background: color }}
          />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
