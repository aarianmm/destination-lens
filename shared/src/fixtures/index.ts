/**
 * Deterministic fixture generator.
 *
 * Produces a complete, schema-valid, plausible-looking snapshot set so that every
 * frontend agent can build real screens on day one, before the pipeline exists.
 * Same seed => same output, so fixture data is stable across agents and CI runs.
 *
 * Fixture data is clearly marked: `meta.sources` says FIXTURE, and images are inline
 * SVG gradients rather than real photography.
 */
import {
  WEEKS_OF_HISTORY,
  countrySchema,
  destinationSchema,
  metaSchema,
  worldSchema,
  type Country,
  type Destination,
  type DestinationStatus,
  type Meta,
  type World,
} from '../schema.js';
import { SEED_COUNTRIES, SEED_ORIGINS, type SeedCountry } from './seed.js';

export const FIXTURE_SEED = 20260906;

/** mulberry32 — small, fast, deterministic. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!;
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Mondays for the trailing 26 COMPLETE weeks, oldest first, relative to `now`.
 * Must stay identical to `pipeline/src/lib/weeks.ts` — the in-progress week is
 * excluded so no partial week is ever averaged into "recent".
 */
export function weekStartsFor(now: Date): string[] {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // 0 = Monday
  const thisMonday = day.getTime() - dow * 86400000;
  const lastCompleteMonday = thisMonday - 7 * 86400000;
  const out: string[] = [];
  for (let i = WEEKS_OF_HISTORY - 1; i >= 0; i--) {
    out.push(new Date(lastCompleteMonday - i * 7 * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

/** How a fixture destination behaves over time. Mirrors the real status vocabulary. */
type Shape = 'established' | 'emerging' | 'new' | 'declining' | 'quiet';

/** Each country gets a fixed mix so every UI state appears somewhere. */
const SHAPE_ROTATION: Shape[] = [
  'established',
  'established',
  'emerging',
  'quiet',
  'emerging',
  'new',
  'declining',
  'quiet',
];

function series(r: () => number, shape: Shape): number[] {
  const w: number[] = [];
  const noise = () => 0.85 + r() * 0.3;
  switch (shape) {
    case 'established': {
      const base = 120 + Math.floor(r() * 380);
      for (let i = 0; i < WEEKS_OF_HISTORY; i++) {
        const seasonal = 1 + 0.12 * Math.sin((i / WEEKS_OF_HISTORY) * Math.PI * 2);
        w.push(Math.max(0, Math.round(base * seasonal * noise())));
      }
      return w;
    }
    case 'emerging': {
      const base = 12 + Math.floor(r() * 30);
      const takeoff = WEEKS_OF_HISTORY - 6 - Math.floor(r() * 4);
      for (let i = 0; i < WEEKS_OF_HISTORY; i++) {
        const lift = i < takeoff ? 1 : 1 + (i - takeoff) * (0.35 + r() * 0.25);
        w.push(Math.max(0, Math.round(base * lift * noise())));
      }
      return w;
    }
    case 'new': {
      const onset = WEEKS_OF_HISTORY - 5;
      for (let i = 0; i < WEEKS_OF_HISTORY; i++) {
        w.push(i < onset ? (r() < 0.15 ? 1 : 0) : Math.round((10 + r() * 26) * noise()));
      }
      return w;
    }
    case 'declining': {
      const base = 90 + Math.floor(r() * 160);
      for (let i = 0; i < WEEKS_OF_HISTORY; i++) {
        const decay = 1 - Math.min(0.62, (i / WEEKS_OF_HISTORY) * 0.8);
        w.push(Math.max(0, Math.round(base * decay * noise())));
      }
      return w;
    }
    case 'quiet': {
      const base = 3 + Math.floor(r() * 9);
      for (let i = 0; i < WEEKS_OF_HISTORY; i++) w.push(Math.max(0, Math.round(base * noise())));
      return w;
    }
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Same derivation the real pipeline uses, so fixture numbers stay self-consistent.
 *
 * Growth is clamped: a destination rising from a near-zero baseline produces
 * arithmetically true but editorially useless numbers ("+3505%"). The real trend
 * module clamps identically, and the UI prefers the status label over the number
 * for `new` destinations.
 */
export const MAX_GROWTH_PCT = 400;

function stats(weekly: number[]) {
  const baselineWeeks = weekly.slice(0, WEEKS_OF_HISTORY - 4);
  const recentWeeks = weekly.slice(WEEKS_OF_HISTORY - 4);
  const baseline = mean(baselineWeeks);
  const recent = mean(recentWeeks);
  const raw = ((recent - baseline) / Math.max(baseline, 0.5)) * 100;
  const growthPct = Math.max(-100, Math.min(MAX_GROWTH_PCT, raw));
  return { baseline, recent, growthPct: round(growthPct) };
}

const STATUS_BY_SHAPE: Record<Shape, DestinationStatus> = {
  established: 'established',
  emerging: 'emerging',
  new: 'new',
  declining: 'declining',
  quiet: 'quiet',
};

const THEME_POOL = [
  { emoji: '🏝️', label: 'Beaches' },
  { emoji: '🌿', label: 'Less crowded' },
  { emoji: '💰', label: 'Affordable' },
  { emoji: '🤿', label: 'Diving' },
  { emoji: '☀️', label: 'Winter sun' },
  { emoji: '🍜', label: 'Food scene' },
  { emoji: '🏛️', label: 'History' },
  { emoji: '🥾', label: 'Hiking' },
  { emoji: '🛶', label: 'Slow travel' },
  { emoji: '💻', label: 'Remote work' },
  { emoji: '🎨', label: 'Art & design' },
  { emoji: '🚉', label: 'Easy to reach' },
];

const POSITIVE_POOL = [
  'Quieter than the better-known spots nearby',
  'Beaches described as genuinely uncrowded',
  'Good value compared with last year',
  'Easy to get around without a car',
  'Food repeatedly singled out as a highlight',
  'Shoulder season weather praised',
];

const NEGATIVE_POOL = [
  'Cheap accommodation getting harder to find',
  'Some report crowding at peak times',
  'Transport connections described as slow',
  'Prices noticeably up on last season',
  'Weather unreliable outside high season',
];

const QUOTE_POOL = [
  'Much quieter than I expected — barely anyone on the beach at sunset.',
  'Second time here and it still feels underrated.',
  'Prices have crept up but it is still cheaper than the mainland.',
  'Spent a week here working remotely, wifi was fine everywhere.',
  'Getting harder to find a decent room under budget this year.',
  'The food alone would be worth the trip.',
  'Not the easiest place to reach, which is probably why it is still calm.',
];


function blurbFor(name: string, status: DestinationStatus, growthPct: number): string {
  switch (status) {
    case 'emerging':
      return `Conversation about ${name} is up ${Math.round(growthPct)}% on its six-month baseline, driven by travellers describing it as a calmer alternative to nearby hotspots. Most posts mention beaches, value and the shoulder season.`;
    case 'new':
      return `${name} has appeared in travel conversation only in the last few weeks, from a base of almost nothing. Early posts are enthusiastic but the sample is still small.`;
    case 'declining':
      return `Mentions of ${name} have fallen well below their six-month baseline. Recent posts skew towards crowding and rising prices.`;
    case 'established':
      return `${name} remains one of the most discussed destinations in the country, with steady volume across the period and no unusual movement.`;
    default:
      return `There is not yet enough conversation about ${name} to draw a confident trend. It is listed here for completeness.`;
  }
}

export type FixtureSet = {
  meta: Meta;
  world: World;
  countries: Country[];
  destinations: Destination[];
};

export function generateFixtures(now = new Date('2026-09-06T03:00:00.000Z')): FixtureSet {
  const weekStarts = weekStartsFor(now);
  const coveredIso2 = SEED_COUNTRIES.map((c) => c.iso2);

  const originByIso2 = new Map(SEED_ORIGINS.map((o) => [o.iso2, o]));
  const countryNameByIso2 = new Map<string, string>([
    ...SEED_ORIGINS.map((o) => [o.iso2, o.name] as const),
    ...SEED_COUNTRIES.map((c) => [c.iso2, c.name] as const),
  ]);

  const countries: Country[] = [];
  const destinations: Destination[] = [];

  for (const seed of SEED_COUNTRIES) {
    const r = rng(FIXTURE_SEED + hashString(seed.iso2));
    const inbound = buildInbound(r, seed, countryNameByIso2);

    const rows = seed.destinations.map((dest, i) => {
      const dr = rng(FIXTURE_SEED + hashString(dest.slug));
      const shape = SHAPE_ROTATION[i % SHAPE_ROTATION.length]!;
      const weekly = series(dr, shape);
      const { recent, growthPct } = stats(weekly);
      return { dest, shape, weekly, recent, growthPct, dr };
    });

    // interestScore = percentile of recent volume within the country
    const sorted = [...rows].sort((a, b) => a.recent - b.recent);
    const scoreBySlug = new Map(
      sorted.map((row, idx) => [
        row.dest.slug,
        rows.length === 1 ? 100 : Math.round((idx / (rows.length - 1)) * 100),
      ]),
    );

    const countryDestinations = rows.map((row) => {
      const status = STATUS_BY_SHAPE[row.shape];
      const interestScore = scoreBySlug.get(row.dest.slug)!;
      const markets = inbound.slice(0, 3).map((f, idx) => ({
        iso2: f.fromIso2,
        name: f.fromName,
        basis: (idx === 2 ? 'social' : 'flights') as 'flights' | 'social',
      }));

      destinations.push(
        destinationSchema.parse({
          slug: row.dest.slug,
          name: row.dest.name,
          countryIso2: seed.iso2,
          countryName: seed.name,
          lat: row.dest.lat,
          lng: row.dest.lng,
          status,
          growthPct: row.growthPct,
          interestScore,
          weeklyMentions: row.weekly,
          blurb: blurbFor(row.dest.name, status, row.growthPct),
          themes: pickThemes(row.dr),
          sentiment: {
            positive: uniquePicks(row.dr, POSITIVE_POOL, status === 'quiet' ? 1 : 3),
            negative: uniquePicks(row.dr, NEGATIVE_POOL, status === 'quiet' ? 0 : 2),
            quotes:
              status === 'quiet'
                ? []
                : uniquePicks(row.dr, QUOTE_POOL, 3).map((text, qi) => ({
                    text,
                    url: `https://bsky.app/profile/fixture.example/post/${row.dest.slug}-${qi}`,
                    postedAt: new Date(now.getTime() - (qi + 1) * 86400000 * 3).toISOString(),
                  })),
          },
          sourceMarkets: markets.map((m, idx) => ({
            ...m,
            trend: (idx === 0 ? 'up' : idx === 1 ? 'flat' : 'down') as 'up' | 'flat' | 'down',
          })),
        }),
      );

      return {
        slug: row.dest.slug,
        name: row.dest.name,
        lat: row.dest.lat,
        lng: row.dest.lng,
        status,
        interestScore,
        growthPct: row.growthPct,
        weeklyMentions: row.weekly,
        topSourceMarkets: markets,
      };
    });

    countries.push(
      countrySchema.parse({
        iso2: seed.iso2,
        name: seed.name,
        centroid: seed.centroid,
        bounds: seed.bounds,
        covered: true,
        inboundFlows: inbound,
        destinations: countryDestinations,
      }),
    );
  }

  // --- world -----------------------------------------------------------------
  const worldCountries = [
    ...SEED_COUNTRIES.map((c) => ({
      iso2: c.iso2,
      name: c.name,
      lat: c.centroid.lat,
      lng: c.centroid.lng,
      covered: true,
    })),
    ...SEED_ORIGINS.filter((o) => !coveredIso2.includes(o.iso2)).map((o) => ({
      iso2: o.iso2,
      name: o.name,
      lat: o.lat,
      lng: o.lng,
      covered: false,
    })),
  ];

  const wr = rng(FIXTURE_SEED);
  const rawFlows: { fromIso2: string; toIso2: string; raw: number }[] = [];
  for (const dest of worldCountries) {
    const origins = SEED_ORIGINS.filter((o) => o.iso2 !== dest.iso2);
    const n = dest.covered ? 8 : 3;
    for (let i = 0; i < n; i++) {
      const from = pick(wr, origins);
      if (rawFlows.some((f) => f.fromIso2 === from.iso2 && f.toIso2 === dest.iso2)) continue;
      rawFlows.push({
        fromIso2: from.iso2,
        toIso2: dest.iso2,
        raw: (dest.covered ? 40 : 10) + wr() * 100,
      });
    }
  }
  rawFlows.sort((a, b) => b.raw - a.raw);
  const top = rawFlows.slice(0, 200);
  const maxRaw = Math.max(...top.map((f) => f.raw));
  const flows = top.map((f) => ({
    fromIso2: f.fromIso2,
    toIso2: f.toIso2,
    weight: round(f.raw / maxRaw, 3),
  }));

  // Rank by how much conversation was actually ADDED, weighted by volume — not by
  // growth percentage. Percentage ranking puts every zero-baseline `new` place at
  // the top of the feed, which is both dull and misleading; absolute lift keeps
  // genuine movements above statistical noise while still surfacing new signals.
  const rankScore = (d2: Destination) => {
    const recent = mean(d2.weeklyMentions.slice(-4));
    const baseline = mean(d2.weeklyMentions.slice(0, WEEKS_OF_HISTORY - 4));
    return (recent - baseline) * Math.log10(recent + 10);
  };
  const emerging = destinations
    .filter((d2) => d2.status === 'emerging' || d2.status === 'new')
    .sort((a, b) => rankScore(b) - rankScore(a))
    .slice(0, 30)
    .map((d2, i) => ({
      slug: d2.slug,
      name: d2.name,
      countryIso2: d2.countryIso2,
      countryName: d2.countryName,
      lat: d2.lat,
      lng: d2.lng,
      growthPct: d2.growthPct,
      status: d2.status,
      rank: i + 1,
      blurb: d2.blurb,
      image: d2.image,
    }));

  const world = worldSchema.parse({ countries: worldCountries, flows, emerging });

  const meta = metaSchema.parse({
    generatedAt: now.toISOString(),
    schemaVersion: 1,
    countries: coveredIso2,
    weekStarts,
    sources: {
      flights: 'FIXTURE DATA — not a real route network',
      social: 'FIXTURE DATA — not real Bluesky conversation',
    },
  });

  return { meta, world, countries, destinations };

  function buildInbound(
    r: () => number,
    seed: SeedCountry,
    names: Map<string, string>,
  ): { fromIso2: string; fromName: string; weight: number }[] {
    const pool = SEED_ORIGINS.filter((o) => o.iso2 !== seed.iso2);
    const chosen: string[] = [];
    while (chosen.length < 8) {
      const c = pick(r, pool).iso2;
      if (!chosen.includes(c)) chosen.push(c);
    }
    const raws = chosen.map((iso2) => ({ iso2, raw: 20 + r() * 100 }));
    raws.sort((a, b) => b.raw - a.raw);
    const max = raws[0]!.raw;
    return raws.map((x) => ({
      fromIso2: x.iso2,
      fromName: names.get(x.iso2) ?? originByIso2.get(x.iso2)?.name ?? x.iso2,
      weight: round(x.raw / max, 3),
    }));
  }
}

function pickThemes(r: () => number) {
  const picked: typeof THEME_POOL = [];
  while (picked.length < 4) {
    const t = pick(r, THEME_POOL);
    if (!picked.some((p) => p.label === t.label)) picked.push(t);
  }
  return picked.map((t, i) => ({ ...t, weight: round(1 - i * 0.18, 2) }));
}

function uniquePicks(r: () => number, pool: readonly string[], n: number): string[] {
  const out: string[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 50) {
    const v = pick(r, pool);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}
