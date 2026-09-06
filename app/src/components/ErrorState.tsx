import type { ErrorStateProps } from './types.js';

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex max-w-sm items-start gap-3 text-sm text-[var(--color-ink-muted)]" role="alert">
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        className="mt-0.5 shrink-0 text-[var(--color-declining)]"
        aria-hidden
      >
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10 6v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="10" cy="13.5" r="0.9" fill="currentColor" />
      </svg>
      <div>
        <p>{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-[var(--color-ink)] underline decoration-[var(--color-hairline)] underline-offset-4 hover:decoration-[var(--color-ink)]"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
