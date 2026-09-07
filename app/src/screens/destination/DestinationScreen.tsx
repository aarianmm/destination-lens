/**
 * Destination screen (`/d/:slug`) — the full profile: status, growth, why it's
 * gaining attention, what travellers are saying, and where they're coming from.
 *
 * Honesty is a product requirement here, not a nicety (see CLAUDE.md rule 5):
 * the Bluesky signal is never presented as a survey or a real nationality
 * distribution, `new` destinations show a status label instead of a wild
 * percentage off a near-zero base, and every quote links back to its source
 * post so the attribution is the link itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  GlobeScene,
  type ArcDatum,
  type GlobeSceneHandle,
  type PointDatum,
} from '../../scene/index.js';
import {
  ErrorState,
  FlagChip,
  ImageCard,
  Loading,
  Panel,
  QuoteCard,
  Sparkline,
  StatDelta,
  StatusBadge,
} from '../../components/index.js';
import { loadDestination, loadMeta, loadWorld, SnapshotError } from '../../lib/snapshots.js';
import { useSnapshot } from '../../lib/useSnapshot.js';
import { formatDate } from '../../lib/format.js';

/** Tight framing on a single point, closer than the country-level view. */
const DESTINATION_ALTITUDE = 0.35;

export function DestinationScreen() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? '';
  const navigate = useNavigate();

  const [retry, setRetry] = useState(0);
  const destination = useSnapshot(() => loadDestination(slug), [slug, retry]);
  const world = useSnapshot(loadWorld, []);
  const meta = useSnapshot(loadMeta, []);

  const globeRef = useRef<GlobeSceneHandle>(null);
  const [globeReady, setGlobeReady] = useState(false);

  const focusTarget = useMemo(() => {
    if (destination.status !== 'ready') return undefined;
    return { lat: destination.data.lat, lng: destination.data.lng, altitude: DESTINATION_ALTITUDE };
  }, [destination.status, destination.data]);

  useEffect(() => {
    if (globeReady && focusTarget) globeRef.current?.flyTo(focusTarget, 1000);
  }, [globeReady, focusTarget]);

  // Decorative flight-derived arcs into the destination, so the globe behind
  // the panel stays meaningful rather than going inert. Purely illustrative:
  // arc weight here is display order, not a claimed magnitude.
  const arcs: ArcDatum[] = useMemo(() => {
    if (destination.status !== 'ready' || world.status !== 'ready') return [];
    const byIso2 = new Map(world.data.countries.map((c) => [c.iso2, c] as const));
    const flightMarkets = destination.data.sourceMarkets.filter((m) => m.basis === 'flights');
    return flightMarkets.flatMap((m, i) => {
      const from = byIso2.get(m.iso2);
      if (!from) return [];
      return [
        {
          id: `${m.iso2}-${destination.data.slug}`,
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: destination.data.lat,
          toLng: destination.data.lng,
          weight: Math.max(0.3, 1 - i * 0.2),
        },
      ];
    });
  }, [destination.status, destination.data, world.status, world.data]);

  const points: PointDatum[] = useMemo(() => {
    if (destination.status !== 'ready') return [];
    return [
      {
        id: destination.data.slug,
        lat: destination.data.lat,
        lng: destination.data.lng,
        label: destination.data.name,
        status: destination.data.status,
        size: 0.7,
      },
    ];
  }, [destination.status, destination.data]);

  const isMissing =
    destination.status === 'error' &&
    destination.error instanceof SnapshotError &&
    destination.error.kind === 'missing';

  const goBackToCountry = () => {
    if (destination.status === 'ready') navigate(`/c/${destination.data.countryIso2}`);
    else navigate('/');
  };

  return (
    <main className="relative h-full w-full">
      {/* Dimmed, non-interactive globe: it stays behind the panel rather than
          being unmounted, so the destination still feels located in the world. */}
      <div className="absolute inset-0 pointer-events-none opacity-45">
        <GlobeScene
          ref={globeRef}
          mode="country"
          arcs={arcs}
          points={points}
          onReady={() => setGlobeReady(true)}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-void)]/40 to-[var(--color-void)]/85"
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-full max-w-xl items-stretch p-4 pt-24 sm:p-6 sm:pt-24">
        <Panel solid className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden p-0">
          <div className="overflow-y-auto p-6">
            <button
              onClick={goBackToCountry}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              <span aria-hidden>←</span>
              {destination.status === 'ready' ? destination.data.countryName : 'Back'}
            </button>

            {destination.status === 'loading' && <Loading label="Loading destination" />}

            {isMissing && (
              <ErrorState
                message="We couldn't find that destination — the link may be out of date."
              />
            )}

            {destination.status === 'error' && !isMissing && (
              <ErrorState
                message="Could not load this destination."
                onRetry={() => setRetry((r) => r + 1)}
              />
            )}

            {destination.status === 'ready' && (
              <>
                <ImageCard
                  image={destination.data.image}
                  seed={destination.data.slug}
                  alt={destination.data.name}
                  className="h-52 w-full"
                >
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="text-xs uppercase tracking-wide text-white/80">
                      {destination.data.countryName}
                    </p>
                  </div>
                  {destination.data.image && (
                    <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-white/60">
                      {destination.data.image.attribution}
                    </p>
                  )}
                </ImageCard>

                <header className="mt-4">
                  <h1 className="font-display text-3xl text-[var(--color-ink)]">
                    {destination.data.name}
                  </h1>
                  <div className="mt-2 flex items-center gap-3">
                    <StatusBadge status={destination.data.status} />
                    <StatDelta
                      growthPct={destination.data.growthPct}
                      status={destination.data.status}
                      size="lg"
                    />
                  </div>
                </header>

                <div className="mt-4">
                  <p className="mb-1 text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                    26-week interest
                  </p>
                  <Sparkline
                    values={destination.data.weeklyMentions}
                    status={destination.data.status}
                    width={320}
                    height={48}
                    labels={meta.status === 'ready' ? meta.data.weekStarts : undefined}
                  />
                </div>

                {destination.data.blurb && (
                  <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                    {destination.data.blurb}
                  </p>
                )}

                {destination.data.themes.length > 0 && (
                  <section className="mt-5">
                    <h2 className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                      Why it&rsquo;s gaining attention
                    </h2>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {destination.data.themes.map((t) => (
                        <li
                          key={t.label}
                          className="rounded-full border border-[var(--color-hairline)] px-3 py-1 text-sm text-[var(--color-ink)]"
                          style={{ opacity: 0.55 + t.weight * 0.45 }}
                        >
                          <span aria-hidden>{t.emoji}</span> {t.label}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="mt-5">
                  <h2 className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                    What travellers are saying
                  </h2>

                  {(destination.data.sentiment.positive.length > 0 ||
                    destination.data.sentiment.negative.length > 0) && (
                    <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                      {destination.data.sentiment.positive.map((p, i) => (
                        <p key={`pos-${i}`} className="text-sm text-[var(--color-ink-muted)]">
                          <span aria-hidden>+</span> {p}
                        </p>
                      ))}
                      {destination.data.sentiment.negative.map((n, i) => (
                        <p key={`neg-${i}`} className="text-sm text-[var(--color-ink-faint)]">
                          <span aria-hidden>−</span> {n}
                        </p>
                      ))}
                    </div>
                  )}

                  {destination.data.sentiment.quotes.length > 0 ? (
                    <div className="mt-3 space-y-2.5">
                      {destination.data.sentiment.quotes.map((q) => (
                        <div key={q.url}>
                          <QuoteCard text={q.text} url={q.url} postedAt={q.postedAt} />
                          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                            via Bluesky · {formatDate(q.postedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--color-ink-faint)]">
                      Not enough public conversation yet to quote directly.
                    </p>
                  )}
                </section>

                {destination.data.sourceMarkets.length > 0 && (
                  <section className="mt-5">
                    <h2 className="text-xs uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                      Who&rsquo;s talking about it
                    </h2>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                      {destination.data.sourceMarkets.map((m) => (
                        <li key={m.iso2}>
                          <FlagChip iso2={m.iso2} name={m.name} basis={m.basis} trend={m.trend} />
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-xs text-[var(--color-ink-faint)]">
                      Flight-network markets reflect route connections; social markets are
                      inferred from public posts that named a location — never a survey of who
                      actually visited.
                    </p>
                  </section>
                )}

                <p className="mt-6 border-t border-[var(--color-hairline)] pt-3 text-xs text-[var(--color-ink-faint)]">
                  Signals come from public online conversation and the global flight route
                  network — not a survey of travellers, and not a measure of real visitor
                  numbers.
                </p>
              </>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
