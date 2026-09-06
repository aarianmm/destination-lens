/**
 * Wave 0 skeleton: wires real snapshot data into the globe stub so the shell is
 * genuinely alive at Checkpoint A. Agent A rebuilds this screen properly.
 */
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GlobeScene,
  type ArcDatum,
  type GlobeSceneHandle,
  type PointDatum,
} from '../../scene/index.js';
import { loadWorld } from '../../lib/snapshots.js';
import { useSnapshot } from '../../lib/useSnapshot.js';
import { formatGrowth } from '../../lib/format.js';

export function ExploreScreen() {
  const world = useSnapshot(loadWorld, []);
  const globe = useRef<GlobeSceneHandle>(null);
  const navigate = useNavigate();

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

  return (
    <main className="relative h-full w-full">
      <GlobeScene
        ref={globe}
        mode="world"
        arcs={arcs}
        points={points}
        coveredIso2={world.data?.countries.filter((c) => c.covered).map((c) => c.iso2)}
        onCountryClick={(iso2) => navigate(`/c/${iso2}`)}
        onPointClick={(slug) => navigate(`/d/${slug}`)}
        autoRotate
      />

      {world.status === 'error' && (
        <p className="absolute inset-0 flex items-center justify-center text-[var(--color-ink-muted)]">
          Could not load the world snapshot.
        </p>
      )}

      {world.status === 'ready' && (
        <aside className="absolute right-6 top-20 z-10 w-64 rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)]/80 p-4 backdrop-blur">
          <h2 className="mb-3 text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
            🔥 Emerging now
          </h2>
          <ul className="space-y-2">
            {world.data.emerging.slice(0, 5).map((e) => (
              <li key={e.slug}>
                <button
                  onClick={() => navigate(`/d/${e.slug}`)}
                  className="flex w-full items-baseline justify-between gap-3 text-left text-sm text-[var(--color-ink)] hover:text-[var(--color-emerging)]"
                >
                  <span className="truncate">
                    {e.name}
                    <span className="ml-1.5 text-xs text-[var(--color-ink-faint)]">
                      {e.countryName}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--color-emerging)]">
                    {formatGrowth(e.growthPct)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
