import type { LoadingProps } from './types.js';

export function Loading({ label = 'Loading' }: LoadingProps) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-[var(--color-ink-faint)]" role="status">
      <span className="flex gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      </span>
      <span>{label}…</span>
    </div>
  );
}
