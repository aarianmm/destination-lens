/**
 * Search overlay — opened from the header's search icon or the Space key.
 *
 * Centred rather than hung below its trigger: the icon sits at the right edge
 * of the header, so an anchored menu would crowd the viewport edge and clip
 * badly on a phone. The panel is `solid` because unlike the readouts floating
 * over the globe, this one is a modal surface and should occlude the scene.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ErrorState, Loading, Panel, StatDelta, StatusBadge } from '../components/index.js';
import { search, type CountryItem, type DestinationItem, type SearchIndex } from './match.js';
import { getSearchIndex } from './searchIndex.js';

type Row =
  | { key: string; kind: 'country'; item: CountryItem }
  | { key: string; kind: 'destination'; item: DestinationItem };

function flagEmoji(iso2: string): string {
  return iso2.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    getSearchIndex().then(
      (built) => !cancelled && setIndex(built),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Take focus on open and hand it back on close, so dismissing the overlay
  // returns the user to the control they opened it from rather than dropping
  // focus at the top of the document.
  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const results = useMemo(
    () => (index ? search(index, query) : { countries: [], destinations: [] }),
    [index, query],
  );

  // One flat list so the arrow keys walk both groups continuously.
  const rows: Row[] = useMemo(
    () => [
      ...results.countries.map((item): Row => ({ key: `c:${item.iso2}`, kind: 'country', item })),
      ...results.destinations.map(
        (item): Row => ({ key: `d:${item.slug}`, kind: 'destination', item }),
      ),
    ],
    [results],
  );

  useEffect(() => setActive(0), [query]);

  const go = useCallback(
    (row: Row) => {
      navigate(row.kind === 'country' ? `/c/${row.item.iso2}` : `/d/${row.item.slug}`);
      onClose();
    },
    [navigate, onClose],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + rows.length) % rows.length);
      return;
    }
    if (event.key === 'Enter') {
      const row = rows[active];
      if (row) {
        event.preventDefault();
        go(row);
      }
    }
  };

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const activeRow = rows[active];
  const trimmed = query.trim();

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div aria-hidden className="absolute inset-0 bg-[var(--color-void)]/70 backdrop-blur-sm" />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="relative w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Search countries and destinations"
        onKeyDown={onKeyDown}
      >
        <Panel solid className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[var(--color-hairline)] px-4 py-3">
            <SearchIcon className="shrink-0 text-[var(--color-ink-faint)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries and destinations"
              className="w-full bg-transparent text-[15px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)]"
              role="combobox"
              aria-expanded={rows.length > 0}
              aria-controls="search-results"
              aria-activedescendant={activeRow ? `search-row-${activeRow.key}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="hidden shrink-0 rounded border border-[var(--color-hairline)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-faint)] sm:block">
              esc
            </kbd>
          </div>

          <div
            ref={listRef}
            id="search-results"
            role="listbox"
            aria-label="Search results"
            className="max-h-[52vh] overflow-y-auto pb-2"
          >
            {failed && (
              <div className="px-4 py-6">
                <ErrorState
                  message="Could not load the search index."
                  onRetry={() => setAttempt((n) => n + 1)}
                />
              </div>
            )}

            {!failed && !index && (
              <div className="px-4 py-6">
                <Loading label="Preparing search" />
              </div>
            )}

            {index && trimmed === '' && (
              <p className="px-4 py-6 text-sm text-[var(--color-ink-faint)]">
                Type a country or destination name.
              </p>
            )}

            {index && trimmed !== '' && rows.length === 0 && (
              <p className="px-4 py-6 text-sm text-[var(--color-ink-faint)]">
                Nothing matches {'“'}
                {trimmed}
                {'”'}.
              </p>
            )}

            {results.countries.length > 0 && <GroupLabel>Countries</GroupLabel>}
            {results.countries.map((item) => {
              const key = `c:${item.iso2}`;
              return (
                <ResultRow
                  key={key}
                  rowKey={key}
                  active={activeRow?.key === key}
                  onSelect={() => go({ key, kind: 'country', item })}
                  onHover={() => setActive(rows.findIndex((r) => r.key === key))}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {flagEmoji(item.iso2)}
                  </span>
                  <span className="truncate text-[var(--color-ink)]">{item.name}</span>
                  {!item.covered && (
                    // Uncovered countries stay reachable — the country screen
                    // has a calm state for them — but the row must not imply
                    // intelligence we do not have.
                    <span className="ml-auto shrink-0 text-xs text-[var(--color-ink-faint)]">
                      coverage coming soon
                    </span>
                  )}
                </ResultRow>
              );
            })}

            {results.destinations.length > 0 && <GroupLabel>Destinations</GroupLabel>}
            {results.destinations.map((item) => {
              const key = `d:${item.slug}`;
              return (
                <ResultRow
                  key={key}
                  rowKey={key}
                  active={activeRow?.key === key}
                  onSelect={() => go({ key, kind: 'destination', item })}
                  onHover={() => setActive(rows.findIndex((r) => r.key === key))}
                >
                  <span className="truncate text-[var(--color-ink)]">{item.name}</span>
                  <span className="truncate text-xs text-[var(--color-ink-faint)]">
                    {item.countryName}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <StatDelta growthPct={item.growthPct} status={item.status} size="sm" />
                    <StatusBadge status={item.status} size="sm" />
                  </span>
                </ResultRow>
              );
            })}
          </div>
        </Panel>
      </motion.div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pt-3 pb-1 text-[10px] tracking-[0.16em] text-[var(--color-ink-faint)] uppercase">
      {children}
    </p>
  );
}

function ResultRow({
  rowKey,
  active,
  onSelect,
  onHover,
  children,
}: {
  rowKey: string;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
  children: ReactNode;
}) {
  return (
    <button
      id={`search-row-${rowKey}`}
      role="option"
      aria-selected={active}
      data-active={active}
      onClick={onSelect}
      // Mouse and keyboard share one highlight, so hovering moves the selection
      // rather than lighting a second row. `mousemove` not `mouseenter`: the
      // list scrolls under a stationary cursor when the arrows walk it.
      onMouseMove={onHover}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
        active ? 'bg-[var(--color-surface-2)]' : ''
      }`}
    >
      {children}
    </button>
  );
}

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.8 12.8L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
