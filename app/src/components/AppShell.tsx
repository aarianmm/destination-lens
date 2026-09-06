/**
 * Placeholder shell — Agent C owns `components/` and will replace this with the
 * real header/nav and loading/error primitives.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSnapshot } from '../lib/useSnapshot.js';
import { loadMeta } from '../lib/snapshots.js';
import { formatDate } from '../lib/format.js';

export function AppShell({ children }: { children: ReactNode }) {
  const meta = useSnapshot(loadMeta, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-void)]">
      {children}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-4">
        <Link to="/" className="pointer-events-auto font-display text-xl text-[var(--color-ink)]">
          Destination Lens
        </Link>
        <div className="pointer-events-auto flex items-center gap-5 text-sm text-[var(--color-ink-muted)]">
          <Link to="/discover" className="hover:text-[var(--color-ink)]">
            Discover
          </Link>
          {meta.status === 'ready' && (
            <span className="hidden text-xs text-[var(--color-ink-faint)] sm:inline">
              updated {formatDate(meta.data.generatedAt)}
            </span>
          )}
        </div>
      </header>
    </div>
  );
}
