import { formatDate } from '../lib/format.js';
import type { QuoteCardProps } from './types.js';

export function QuoteCard({ text, url, postedAt }: QuoteCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative block rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface-2)]/40 p-4 transition-colors duration-200 hover:border-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)]/70"
    >
      <p className="font-display text-lg leading-snug text-[var(--color-ink)]">
        <span aria-hidden className="text-[var(--color-ink-faint)]">
          “
        </span>
        {text}
        <span aria-hidden className="text-[var(--color-ink-faint)]">
          ”
        </span>
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)]">
        <time dateTime={postedAt}>{formatDate(postedAt)}</time>
        <span aria-hidden>·</span>
        <span className="text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]">
          View on Bluesky ↗
        </span>
      </p>
    </a>
  );
}
