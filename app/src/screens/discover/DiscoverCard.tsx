/**
 * Card presentation for the Discover grid. Two flavours share one visual
 * language: a large editorial "feature" for the top-ranked destinations, and
 * a denser magazine-index card for the rest of the list.
 */
import { motion } from 'framer-motion';
import type { World } from '@dl/shared';
import { FlagChip, ImageCard, StatDelta, StatusBadge } from '../../components/index.js';

type EmergingEntry = World['emerging'][number];

const EASE = [0.16, 1, 0.3, 1] as const;

function entryMotion(index: number, reduceMotion: boolean) {
  if (reduceMotion) return {};
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.55, delay: Math.min(index * 0.06, 0.36), ease: EASE },
  };
}

type CardProps = {
  entry: EmergingEntry;
  index: number;
  onOpen: () => void;
  reduceMotion: boolean;
};

export function FeaturedCard({ entry, index, onOpen, reduceMotion }: CardProps) {
  return (
    <motion.button
      {...entryMotion(index, reduceMotion)}
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] text-left shadow-[var(--shadow-panel)] transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <ImageCard image={entry.image} seed={entry.slug} alt={entry.name} className="aspect-[3/4] w-full">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[var(--color-void)] via-[var(--color-void)]/15 to-transparent transition-opacity duration-300 group-hover:from-[var(--color-void)]/95"
        />
        <span
          aria-hidden
          className="absolute left-4 top-4 font-display text-4xl text-white/25 transition-colors group-hover:text-white/40"
        >
          {String(entry.rank).padStart(2, '0')}
        </span>
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <StatusBadge status={entry.status} size="sm" />
            <StatDelta growthPct={entry.growthPct} status={entry.status} size="md" />
          </div>
          <h3 className="font-display text-2xl leading-tight text-[var(--color-ink)] sm:text-3xl">
            {entry.name}
          </h3>
          <div className="mt-1.5">
            <FlagChip iso2={entry.countryIso2} name={entry.countryName} />
          </div>
          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">
            {entry.blurb}
          </p>
        </div>
      </ImageCard>
    </motion.button>
  );
}

export function IndexCard({ entry, index, onOpen, reduceMotion }: CardProps) {
  return (
    <motion.button
      {...entryMotion(index, reduceMotion)}
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)]/50 text-left shadow-[var(--shadow-panel)] transition-colors duration-300 hover:border-[var(--color-ink-faint)]"
    >
      <ImageCard image={entry.image} seed={entry.slug} alt={entry.name} className="aspect-[4/3] w-full">
        <div className="absolute right-2 top-2">
          <StatusBadge status={entry.status} size="sm" />
        </div>
        <span
          aria-hidden
          className="absolute left-2 top-2 font-display text-lg text-white/30 transition-colors group-hover:text-white/50"
        >
          {String(entry.rank).padStart(2, '0')}
        </span>
      </ImageCard>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-xl leading-tight text-[var(--color-ink)]">{entry.name}</h3>
          <StatDelta growthPct={entry.growthPct} status={entry.status} size="sm" />
        </div>
        <FlagChip iso2={entry.countryIso2} name={entry.countryName} />
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--color-ink-muted)]">
          {entry.blurb}
        </p>
      </div>
    </motion.button>
  );
}
