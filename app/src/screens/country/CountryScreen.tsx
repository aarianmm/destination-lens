/**
 * Country screen (`/c/:iso2`) — "who is travelling here, where are they going,
 * and what is becoming interesting?"
 *
 * Deep intelligence only exists for the curated countries in `meta.countries`.
 * Everywhere else, `data/country/{iso2}.json` simply does not exist and
 * `loadCountry` rejects with a `SnapshotError` of kind `'missing'`. That is not
 * a bug to alarm the user about — it is an honest "we don't cover this yet"
 * state, so it gets its own calm panel rather than the generic error state.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { World } from '@dl/shared';
import {
  GlobeScene,
  type ArcDatum,
  type GlobeSceneHandle,
  type PointDatum,
} from '../../scene/index.js';
import {
  ErrorState,
  FlagChip,
  Loading,
  Panel,
  Sparkline,
  StatDelta,
  StatusBadge,
} from '../../components/index.js';
import { loadCountry, loadMeta, loadWorld, SnapshotError } from '../../lib/snapshots.js';
import { useSnapshot } from '../../lib/useSnapshot.js';
import { useAppStore } from '../../lib/store.js';

type WorldCountry = World['countries'][number];

type ResolvedFlow = { iso2: string; name: string; weight: number };

/** Rough camera altitude that frames a country's bounding box. */
function altitudeForBounds(bounds: { north: number; south: number; east: number; west: number }) {
  const height = bounds.north - bounds.south;
  const rawWidth = bounds.east - bounds.west;
  const width = rawWidth < 0 ? rawWidth + 360 : rawWidth; // dateline wrap
  const extent = Math.max(height, width);
  return Math.min(1.6, Math.max(0.35, extent / 22));
}

/** Default framing when we only know a country's centroid, not its bounds. */
const UNCOVERED_ALTITUDE = 0.9;

export function CountryScreen() {
  const params = useParams<{ iso2: string }>();
  const iso2 = (params.iso2 ?? '').toUpperCase();
  const navigate = useNavigate();
  const setHoveredSlug = useAppStore((s) => s.setHoveredSlug);
  const setHoveredCountry = useAppStore((s) => s.setHoveredCountry);

  const [retry, setRetry] = useState(0);
  const world = useSnapshot(loadWorld, [retry]);
  const country = useSnapshot(() => loadCountry(iso2), [iso2, retry]);
  const meta = useSnapshot(loadMeta, []);

  const globeRef = useRef<GlobeSceneHandle>(null);
  const [globeReady, setGlobeReady] = useState(false);

  const worldByIso2 = useMemo(() => {
    if (world.status !== 'ready') return new Map<string, WorldCountry>();
    return new Map(world.data.countries.map((c) => [c.iso2, c] as const));
  }, [world.status, world.data]);

  const worldEntry = worldByIso2.get(iso2);
  const isMissing =
    country.status === 'error' &&
    country.error instanceof SnapshotError &&
    country.error.kind === 'missing';
  const isOtherError = country.status === 'error' && !isMissing;

  const countryName =
    country.status === 'ready' ? country.data.name : (worldEntry?.name ?? iso2);

  // "Who's coming here": the country's own inbound flows when we have deep
  // coverage, otherwise derived from the global route network so an uncovered
  // country still shows something honest rather than nothing at all.
  const inboundFlows: ResolvedFlow[] = useMemo(() => {
    if (country.status === 'ready') {
      return country.data.inboundFlows.map((f) => ({
        iso2: f.fromIso2,
        name: f.fromName,
        weight: f.weight,
      }));
    }
    if (isMissing && world.status === 'ready') {
      return world.data.flows
        .filter((f) => f.toIso2 === iso2)
        .map((f) => ({
          iso2: f.fromIso2,
          name: worldByIso2.get(f.fromIso2)?.name ?? f.fromIso2,
          weight: f.weight,
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 12);
    }
    return [];
  }, [country.status, country.data, isMissing, world.status, world.data, worldByIso2, iso2]);

  const focusTarget = useMemo(() => {
    if (country.status === 'ready') {
      return {
        lat: country.data.centroid.lat,
        lng: country.data.centroid.lng,
        altitude: altitudeForBounds(country.data.bounds),
      };
    }
    if (worldEntry) {
      return { lat: worldEntry.lat, lng: worldEntry.lng, altitude: UNCOVERED_ALTITUDE };
    }
    return undefined;
  }, [country.status, country.data, worldEntry]);

  useEffect(() => {
    if (globeReady && focusTarget) globeRef.current?.flyTo(focusTarget, 1200);
  }, [globeReady, focusTarget]);

  const arcs: ArcDatum[] = useMemo(() => {
    const to =
      country.status === 'ready'
        ? country.data.centroid
        : worldEntry
          ? { lat: worldEntry.lat, lng: worldEntry.lng }
          : undefined;
    if (!to) return [];
    return inboundFlows.flatMap((f) => {
      const from = worldByIso2.get(f.iso2);
      if (!from) return [];
      return [
        {
          id: `${f.iso2}-${iso2}`,
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: to.lat,
          toLng: to.lng,
          weight: f.weight,
        },
      ];
    });
  }, [inboundFlows, worldByIso2, country.status, country.data, worldEntry, iso2]);

  const points: PointDatum[] = useMemo(() => {
    if (country.status !== 'ready') return [];
    return country.data.destinations.map((d) => ({
      id: d.slug,
      lat: d.lat,
      lng: d.lng,
      label: d.name,
      status: d.status,
      size: Math.max(0.15, d.interestScore / 100),
    }));
  }, [country.status, country.data]);

  const sortedDestinations = useMemo(() => {
    if (country.status !== 'ready') return [];
    return [...country.data.destinations].sort(
      (a, b) => b.interestScore - a.interestScore || b.growthPct - a.growthPct,
    );
  }, [country.status, country.data]);

  const coveredIso2 = world.status === 'ready' ? world.data.countries.filter((c) => c.covered).map((c) => c.iso2) : undefined;

  return (
    <main className="relative h-full w-full">
      <GlobeScene
        ref={globeRef}
        mode="country"
        arcs={arcs}
        points={points}
        highlightedCountryIso2={iso2}
        coveredIso2={coveredIso2}
        onCountryClick={(clicked) => navigate(`/c/${clicked}`)}
        onCountryHover={setHoveredCountry}
        onPointClick={(slug) => navigate(`/d/${slug}`)}
        onPointHover={setHoveredSlug}
        onReady={() => setGlobeReady(true)}
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-full max-w-md items-stretch p-4 pt-24 sm:p-6 sm:pt-24">
        <Panel solid className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden p-5">
          {world.status === 'error' && country.status !== 'ready' && !isMissing && (
            <ErrorState
              message="Could not load world travel-flow data."
              onRetry={() => setRetry((r) => r + 1)}
            />
          )}

          {country.status === 'loading' && (
            <>
              <p className="text-xs uppercase tracking-widest text-[var(--color-ink-faint)]">
                Country
              </p>
              <h1 className="font-display text-3xl text-[var(--color-ink)]">{countryName}</h1>
              <div className="mt-6">
                <Loading label="Loading country" />
              </div>
            </>
          )}

          {isOtherError && (
            <>
              <p className="text-xs uppercase tracking-widest text-[var(--color-ink-faint)]">
                Country
              </p>
              <h1 className="font-display text-3xl text-[var(--color-ink)]">{countryName}</h1>
              <div className="mt-6">
                <ErrorState
                  message="Could not load this country's data."
                  onRetry={() => setRetry((r) => r + 1)}
                />
              </div>
            </>
          )}

          {isMissing && (
            <div className="overflow-y-auto">
              <p className="text-xs uppercase tracking-widest text-[var(--color-ink-faint)]">
                Country
              </p>
              <h1 className="font-display text-3xl text-[var(--color-ink)]">{countryName}</h1>

              {inboundFlows.length > 0 && (
                <section className="mt-5">
                  <h2 className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                    Who&rsquo;s coming here
                  </h2>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {inboundFlows.map((f) => (
                      <li key={f.iso2}>
                        <FlagChip iso2={f.iso2} name={f.name} basis="flights" />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="mt-6 rounded-xl border border-dashed border-[var(--color-hairline)] p-4">
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  Deep coverage coming soon
                </p>
                <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
                  We don&rsquo;t yet track destination-level conversation or trends for{' '}
                  {countryName}. The flows above come from the global flight route network we
                  already track; there is no per-destination interest data here yet.
                </p>
              </div>
            </div>
          )}

          {country.status === 'ready' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="text-xs uppercase tracking-widest text-[var(--color-ink-faint)]">
                Country
              </p>
              <h1 className="font-display text-3xl text-[var(--color-ink)]">{countryName}</h1>

              <section className="mt-4">
                <h2 className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                  Who&rsquo;s coming here
                </h2>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {country.data.inboundFlows.map((f) => (
                    <li key={f.fromIso2}>
                      <FlagChip iso2={f.fromIso2} name={f.fromName} basis="flights" />
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-5 flex min-h-0 flex-1 flex-col">
                <h2 className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                  Destinations
                </h2>
                <ul className="mt-2 flex-1 divide-y divide-[var(--color-hairline)] overflow-y-auto">
                  {sortedDestinations.map((d) => (
                    <li key={d.slug}>
                      <button
                        onClick={() => navigate(`/d/${d.slug}`)}
                        onMouseEnter={() => setHoveredSlug(d.slug)}
                        onMouseLeave={() => setHoveredSlug(null)}
                        className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-[var(--color-surface-2)]/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-[var(--color-ink)]">
                              {d.name}
                            </span>
                            <StatusBadge status={d.status} size="sm" />
                          </div>
                          <div className="mt-1.5">
                            <Sparkline
                              values={d.weeklyMentions}
                              status={d.status}
                              width={110}
                              height={22}
                              labels={meta.status === 'ready' ? meta.data.weekStarts : undefined}
                            />
                          </div>
                        </div>
                        <StatDelta growthPct={d.growthPct} status={d.status} size="sm" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
