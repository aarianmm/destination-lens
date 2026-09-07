import { formatDate } from '../lib/format.js';
import type { QuoteCardProps } from './types.js';

/**
 * Sample quotes come from the fixture generator and point at profiles that do
 * not exist. Linking them out would send a reader to a dead Bluesky URL and
 * imply a real person said something nobody said, so they render as inert cards
 * that say what they are. Quotes from a real pipeline run keep their link and
 * their attribution.
 */
const isSampleQuote = (url: string) => url.includes('fixture.example');

export function QuoteCard({ text, url, postedAt }: QuoteCardProps) {
  const sample = isSampleQuote(url);

  const body = (
    <>
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
        {sample ? (
          <span>Sample quote — not a real post. Awaiting a full pipeline run.</span>
        ) : (
          <>
            <time dateTime={postedAt}>{formatDate(postedAt)}</time>
            <span aria-hidden>·</span>
            <span className="text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]">
              View on Bluesky ↗
            </span>
          </>
        )}
      </p>
    </>
  );

  const shell =
    'group relative block rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface-2)]/40 p-4';

  if (sample) {
    return <div className={`${shell} border-dashed opacity-80`}>{body}</div>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`${shell} transition-colors duration-200 hover:border-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)]/70`}
    >
      {body}
    </a>
  );
}
