/**
 * Screen 1 — the hero. Full-bleed globe, a compact "emerging now" rail, and a
 * hover readout for whichever country the cursor is over. Country click flies
 * the camera in before navigating, so the country screen picks up mid-motion
 * rather than cutting hard. See idea.md's "wow — I can see the world moving."
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorState, Loading, Panel, StatDelta, StatusBadge } from '../../components/index.js';
import { loadWorld } from '../../lib/snapshots.js';
import { useAppStore } from '../../lib/store.js';
import { useSnapshot } from '../../lib/useSnapshot.js';
import {
  GlobeScene,
  type ArcDatum,
  type CameraTarget,
  type GlobeSceneHandle,
  type PointDatum,
} from '../../scene/index.js';

/** Flying the camera in before navigating sells the "zoom into a country" feel. */
const COUNTRY_FLY_MS = 1100;

export function ExploreScreen() {
  const world = useSnapshot(loadWorld, []);
  const globe = useRef<GlobeSceneHandle>(null);
  const navigate = useNavigate();
  const markInteracted = useAppStore((s) => s.markInteracted);
  const setHoveredCountry = useAppStore((s) => s.setHoveredCountry);
  const [hoveredIso2, setHoveredIso2] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const { arcs, points } = useMemo(() => {
    if (world.status !== 'ready') return { arcs: [] as ArcDatum[], points: [] as PointDatum[] };
    const byIso2 = new Map(world.data.countries.map((c) => [c.iso2, c]));
    const arcs: ArcDatum[] = world.data.flows.slice(0, 150).flatMap((f) => {
      const from = byIso2.get(f.fromIso2);
      const to = byIso2.get(f.toIso2);
      if (!from || !to) return [];
      return [
        {
          id: `${f.fromIso2}-${f.toIso2}`,
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: to.lat,
          toLng: to.lng,
          weight: f.weight,
        },
      ];
    });
    const points: PointDatum[] = world.data.emerging.map((e) => ({
      id: e.slug,
      lat: e.lat,
      lng: e.lng,
      label: e.name,
      status: e.status,
      size: 0.5 + Math.min(1, e.growthPct / 200) * 0.5,
    }));
    return { arcs, points };
  }, [world.status, world.data]);

  const coveredIso2 = useMemo(
    () => world.data?.countries.filter((c) => c.covered).map((c) => c.iso2) ?? [],
    [world.data],
  );

  const hoveredCountry = useMemo(
    () => world.data?.countries.find((c) => c.iso2 === hoveredIso2) ?? null,
    [world.data, hoveredIso2],
  );

  const handleCountryHover = useCallback(
    (iso2: string | null) => {
      setHoveredIso2(iso2);
      setHoveredCountry(iso2);
    },
    [setHoveredCountry],
  );

  const handleCountryClick = useCallback(
    (iso2: string) => {
      markInteracted();
      setPending(iso2);
      const country = world.data?.countries.find((c) => c.iso2 === iso2);
      const target: CameraTarget = country
        ? { lat: country.lat, lng: country.lng, altitude: 0.6 }
        : { lat: 0, lng: 0, altitude: 0.6 };
      globe.current?.flyTo(target, COUNTRY_FLY_MS);
      window.setTimeout(() => navigate(`/c/${iso2}`), COUNTRY_FLY_MS * 0.7);
    },
    [markInteracted, navigate, world.data],
  );

  const handlePointClick = useCallback(
    (slug: string) => {
      markInteracted();
      navigate(`/d/${slug}`);
    },
    [markInteracted, navigate],
  );

  return (
    <main className="relative h-full w-full">
      <GlobeScene
        ref={globe}
        mode="world"
        arcs={arcs}
        points={points}
        coveredIso2={coveredIso2}
        highlightedCountryIso2={hoveredIso2}
        onCountryClick={handleCountryClick}
        onCountryHover={handleCountryHover}
        onPointClick={handlePointClick}
        autoRotate
      />

      {world.status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loading label="Loading the world" />
        </div>
      )}

      {world.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Panel className="p-4">
            <ErrorState message="Could not load the world snapshot." />
          </Panel>
        </div>
      )}

      {hoveredCountry && (
        <div className="pointer-events-none absolute bottom-6 left-6 z-10">
          <Panel className="px-3 py-1.5">
            <p className="text-sm text-[var(--color-ink)]">
              {hoveredCountry.name}
              {!hoveredCountry.covered && (
                <span className="ml-2 text-xs text-[var(--color-ink-faint)]">
                  coverage coming soon
                </span>
              )}
              {pending === hoveredCountry.iso2 && (
                <span className="ml-2 text-xs text-[var(--color-ink-faint)]">flying in…</span>
              )}
            </p>
          </Panel>
        </div>
      )}

      {world.status === 'ready' && (
        <aside className="absolute right-6 top-20 z-10 w-72">
          <Panel className="p-4">
            <h2 className="mb-3 text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
              🔥 Emerging now
            </h2>
            <ul className="space-y-3">
              {world.data.emerging.slice(0, 5).map((e) => (
                <li key={e.slug}>
                  <button
                    onClick={() => handlePointClick(e.slug)}
                    className="group flex w-full flex-col gap-1 text-left"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-[var(--color-ink)] group-hover:text-[var(--color-emerging)]">
                        {e.name}
                      </span>
                      <StatDelta growthPct={e.growthPct} status={e.status} size="sm" />
                    </span>
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs text-[var(--color-ink-faint)]">
                        {e.countryName}
                      </span>
                      <StatusBadge status={e.status} size="sm" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      )}
    </main>
  );
}
