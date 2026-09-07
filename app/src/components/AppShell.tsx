/**
 * App chrome: wordmark, Discover link, "data updated" status. Deliberately
 * minimal — it floats over the globe and must never compete with it, so it's
 * a thin translucent strip with a soft scrim behind it for legibility, not a
 * bar with a background of its own.
 */
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { Meta } from '@dl/shared';
import { useSnapshot, type SnapshotState } from '../lib/useSnapshot.js';
import { loadMeta } from '../lib/snapshots.js';
import { formatDate } from '../lib/format.js';

export function AppShell({ children }: { children: ReactNode }) {
  const meta = useSnapshot(loadMeta, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-void)]">
      {children}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20">
        {/* Scrim: keeps the header legible over a bright sky or light imagery
            without needing an opaque bar that would compete with the scene. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[var(--color-void)]/70 via-[var(--color-void)]/20 to-transparent"
        />

        {meta.status === 'loading' && (
          <div aria-hidden className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
            <div className="h-full w-1/4 animate-[shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[var(--color-ink-faint)] to-transparent motion-reduce:hidden" />
          </div>
        )}

        <div className="relative flex items-center justify-between px-6 py-4 sm:px-8">
          <NavLink
            to="/"
            className="pointer-events-auto font-display text-xl text-[var(--color-ink)] transition-opacity hover:opacity-80"
          >
            Destination Lens
          </NavLink>

          <nav className="pointer-events-auto flex items-center gap-6 text-sm text-[var(--color-ink-muted)]">
            <NavLink
              to="/discover"
              className={({ isActive }) =>
                `relative py-1 transition-colors hover:text-[var(--color-ink)] ${
                  isActive ? 'text-[var(--color-ink)]' : ''
                }`
              }
            >
              {({ isActive }) => (
                <>
                  Discover
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -bottom-0.5 h-px bg-[var(--color-emerging)]"
                    />
                  )}
                </>
              )}
            </NavLink>
            <DataStatus meta={meta} />
          </nav>
        </div>
      </header>
    </div>
  );
}

function DataStatus({ meta }: { meta: SnapshotState<Meta> }) {
  if (meta.status === 'ready') {
    // Only some countries currently come from a real pipeline run; the rest are
    // illustrative fixtures. `meta.sources` records which, and saying so here
    // keeps the caveat where a viewer can actually see it rather than buried in
    // a JSON file — presenting generated data as measured would undercut the
    // whole premise of the product.
    const provenance = meta.data.sources.social;
    const isPartial = /fixture/i.test(provenance);
    return (
      <span
        className="hidden text-xs text-[var(--color-ink-faint)] sm:inline"
        title={provenance}
      >
        updated {formatDate(meta.data.generatedAt)}
        {isPartial && (
          <span className="ml-2 rounded-full border border-[var(--color-hairline)] px-2 py-0.5">
            partly sample data
          </span>
        )}
      </span>
    );
  }
  if (meta.status === 'error') {
    return (
      <span
        className="hidden text-xs text-[var(--color-declining)] sm:inline"
        title={meta.error.message}
      >
        data unavailable
      </span>
    );
  }
  return null;
}
