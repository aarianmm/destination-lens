import { useId, useMemo, useState, type MouseEvent } from 'react';
import { STATUS_COLOR } from '../lib/format.js';
import type { SparklineProps } from './types.js';

/**
 * A 26-week trend line, legible at list-row scale. A filled gradient under the
 * line reads at a glance even at 96×24; the optional `labels` prop turns on a
 * hover readout for the destination profile's larger rendering.
 */
export function Sparkline({ values, status, width = 96, height = 24, labels }: SparklineProps) {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const accent = status ? STATUS_COLOR[status] : 'var(--color-ink-muted)';

  const coords = useMemo(() => {
    if (values.length < 2) return [];
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    const pad = 2; // keep the stroke off the very edge so it never visually clips
    const usableH = height - pad * 2;
    return values.map((v, i) => ({
      x: (i / (values.length - 1)) * width,
      y: pad + usableH - ((v - min) / range) * usableH,
    }));
  }, [values, width, height]);

  if (coords.length === 0) return <svg width={width} height={height} aria-hidden />;

  const linePoints = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
  const lastIdx = coords.length - 1;
  const activeIdx = hoverIdx ?? lastIdx;
  const active = coords[activeIdx];

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    if (!labels) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * lastIdx);
    setHoverIdx(Math.min(lastIdx, Math.max(0, idx)));
  }

  return (
    <span className="relative inline-block align-middle" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={labels ? handleMove : undefined}
        onMouseLeave={labels ? () => setHoverIdx(null) : undefined}
        className={labels ? 'cursor-crosshair' : undefined}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#${gradientId})`} stroke="none" />
        <polyline
          points={linePoints}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* A quiet marker on the latest value, always visible. */}
        <circle cx={coords[lastIdx]?.x} cy={coords[lastIdx]?.y} r={1.6} fill={accent} />
        {labels && hoverIdx !== null && active && (
          <>
            <line x1={active.x} y1={0} x2={active.x} y2={height} stroke={accent} strokeOpacity={0.25} />
            <circle
              cx={active.x}
              cy={active.y}
              r={2.75}
              fill={accent}
              stroke="var(--color-void)"
              strokeWidth={1}
            />
          </>
        )}
      </svg>
      {labels && hoverIdx !== null && active && (
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface-2)] px-2 py-1 text-[10px] shadow-[var(--shadow-panel)]"
          style={{ left: Math.min(Math.max(active.x, 30), width - 30), top: -6 }}
        >
          <div className="text-[var(--color-ink-faint)]">{labels[activeIdx]}</div>
          <div className="font-medium text-[var(--color-ink)]">{values[activeIdx]}</div>
        </div>
      )}
    </span>
  );
}
