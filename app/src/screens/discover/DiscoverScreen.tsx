/**
 * "Emerging destinations around the world" — a ranked, editorial index of
 * `world.emerging`, not a data table. The top few get a large feature
 * treatment; the rest read as a magazine-style grid.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { loadWorld } from '../../lib/snapshots.js';
import { useSnapshot } from '../../lib/useSnapshot.js';
import { ErrorState, Loading } from '../../components/index.js';
import { FeaturedCard, IndexCard } from './DiscoverCard.js';

const FEATURED_COUNT = 3;

export function DiscoverScreen() {
  const world = useSnapshot(loadWorld, []);
  const navigate = useNavigate();
  const reduceMotion = Boolean(useReducedMotion());

  const entries = useMemo(
    () => (world.status === 'ready' ? [...world.data.emerging].sort((a, b) => a.rank - b.rank) : []),
    [world.status, world.data],
  );
  const featured = entries.slice(0, FEATURED_COUNT);
  const rest = entries.slice(FEATURED_COUNT);

  return (
    <main className="relative h-full w-full overflow-y-auto">
      <div aria-hidden className="starfield pointer-events-none fixed inset-0 opacity-40" />

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-28 sm:px-10 lg:px-16">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 max-w-2xl"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">Discover</p>
          <h1 className="mt-2 font-display text-4xl text-[var(--color-ink)] sm:text-5xl">
            Emerging destinations, around the world
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Ranked by how sharply public conversation is climbing against its own six-month
            baseline — a signal of shifting attention, not a survey of visitors.
          </p>
        </motion.header>

        {world.status === 'loading' && <Loading label="Loading emerging destinations" />}

        {world.status === 'error' && (
          <ErrorState
            message="Could not load emerging destinations."
            onRetry={() => window.location.reload()}
          />
        )}

        {world.status === 'ready' && entries.length === 0 && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No emerging signal yet — check back soon.
          </p>
        )}

        {featured.length > 0 && (
          <section className="mb-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {featured.map((entry, i) => (
              <FeaturedCard
                key={entry.slug}
                entry={entry}
                index={i}
                reduceMotion={reduceMotion}
                onOpen={() => navigate(`/d/${entry.slug}`)}
              />
            ))}
          </section>
        )}

        {rest.length > 0 && (
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rest.map((entry, i) => (
              <IndexCard
                key={entry.slug}
                entry={entry}
                index={i}
                reduceMotion={reduceMotion}
                onOpen={() => navigate(`/d/${entry.slug}`)}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
