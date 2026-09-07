/**
 * AGENT F owns this module.
 *
 * Combines every stage artifact into the published snapshot set, validates against
 * the frozen schema, enforces size budgets, and writes `data/`.
 *
 * Contract note (see final report / PR description for the full writeup): the
 * frozen `EnrichmentArtifact` only carries `quoteUris`, not quote text/url/postedAt
 * — those live on the `MentionsArtifact` posts the enrichment stage validated them
 * against. So `assemble()` needs the mentions too, to hydrate a quoteUri into a
 * displayable quote. `AssembleInput` isn't frozen (it's defined in this file), so
 * it gained a `mentions` map for that. Likewise, image fetching is async and
 * `assemble()` is a pure/sync function by design (easy to unit test), so lead
 * images are pre-fetched by the caller and passed in via `images`.
 */
import type { z } from 'zod';
import type {
  countryDestinationSchema,
  destinationSourceMarketSchema,
  sourceMarketSchema,
  trendDirectionSchema,
} from '@dl/shared';
import {
  countrySchema,
  destinationSchema,
  metaSchema,
  worldSchema,
  SIZE_BUDGETS,
  WEEKS_OF_HISTORY,
  type Country,
  type Destination,
  type EnrichmentArtifact,
  type FlowsArtifact,
  type Meta,
  type MentionsArtifact,
  type TrendsArtifact,
  type Vocab,
  type World,
} from '@dl/shared';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../lib/paths.js';
import { readJson, writeJson } from '../lib/json.js';
import { log } from '../lib/log.js';
import { ISO2_NAMES } from '../enrich/origins.js';
import type { LeadImage } from '../enrich/wikipedia.js';

// Not exported as named types from the frozen schema module — derived here via
// z.infer from the schema objects it does export.
type CountryDestination = z.infer<typeof countryDestinationSchema>;
type SourceMarket = z.infer<typeof sourceMarketSchema>;
type DestinationSourceMarket = z.infer<typeof destinationSourceMarketSchema>;
type TrendDirection = z.infer<typeof trendDirectionSchema>;

export type AssembleInput = {
  flows: FlowsArtifact;
  trends: TrendsArtifact;
  vocabs: Vocab[];
  /** Keyed by destination slug. Needed to hydrate `synthesis.quoteUris` into full quotes. */
  mentions: Map<string, MentionsArtifact>;
  /** Keyed by destination slug. Missing entry = enrichment was skipped for that destination. */
  enrichment: Map<string, EnrichmentArtifact>;
  /** Keyed by destination slug. Pre-fetched (imagery is async; assemble is not). */
  images?: Map<string, LeadImage | undefined>;
  weekStarts: string[];
  generatedAt: string;
};

export type AssembleOutput = {
  meta: Meta;
  world: World;
  countries: Country[];
  destinations: Destination[];
};

/**
 * A destination's own status/growth (already decided by trend maths) is the only
 * signal we have for a source market's direction — the pipeline has no per-origin
 * time series, flight or social. This is a documented simplification, not a
 * separate piece of maths: every source market for a destination shares that
 * destination's overall trend direction.
 */
function destinationTrendDirection(growthPct: number): TrendDirection {
  if (growthPct > 5) return 'up';
  if (growthPct < -5) return 'down';
  return 'flat';
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function assemble(input: AssembleInput): AssembleOutput {
  const { flows, trends, vocabs, mentions, enrichment, images, weekStarts, generatedAt } = input;

  const countryNameByIso2 = new Map<string, string>();
  for (const c of flows.countries) countryNameByIso2.set(c.iso2, c.name);
  for (const v of vocabs) countryNameByIso2.set(v.iso2, v.name);
  for (const [iso2, name] of ISO2_NAMES)
    if (!countryNameByIso2.has(iso2)) countryNameByIso2.set(iso2, name);

  const trendBySlug = new Map(trends.results.map((t) => [t.slug, t]));

  const destinations: Destination[] = [];
  const countries: Country[] = [];

  for (const vocab of vocabs) {
    const inboundFlows = [...(flows.inboundByCountry[vocab.iso2] ?? [])]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20)
      .map((f) => ({
        fromIso2: f.fromIso2,
        fromName: countryNameByIso2.get(f.fromIso2) ?? f.fromIso2,
        weight: f.weight,
      }));

    const countryDestinations: CountryDestination[] = [];

    for (const vd of vocab.destinations) {
      const trend = trendBySlug.get(vd.slug);
      // No trend data yet for this destination (e.g. collector hasn't run for it):
      // omit it rather than fabricate a status. It simply doesn't appear this run.
      if (!trend) continue;

      const enrich = enrichment.get(vd.slug);
      const synthesis = enrich?.synthesis;

      const { destMarkets, countryMarkets } = buildSourceMarkets(
        enrich,
        inboundFlows,
        countryNameByIso2,
        destinationTrendDirection(trend.growthPct),
      );

      const mentionsForSlug = mentions.get(vd.slug);
      const postByUri = new Map((mentionsForSlug?.posts ?? []).map((p) => [p.uri, p]));
      const quotes = (synthesis?.quoteUris ?? [])
        .map((uri) => postByUri.get(uri))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .slice(0, 4)
        .map((p) => ({ text: truncate(p.text, 300), url: p.url, postedAt: p.postedAt }));

      const image = images?.get(vd.slug);

      const destination = destinationSchema.parse({
        slug: vd.slug,
        name: vd.name,
        countryIso2: vocab.iso2,
        countryName: vocab.name,
        lat: vd.lat,
        lng: vd.lng,
        status: trend.status,
        growthPct: trend.growthPct,
        interestScore: trend.interestScore,
        weeklyMentions: trend.weeklyMentions,
        blurb: synthesis?.blurb ?? '',
        themes: synthesis?.themes ?? [],
        sentiment: {
          positive: synthesis?.positive ?? [],
          negative: synthesis?.negative ?? [],
          quotes,
        },
        sourceMarkets: destMarkets,
        image,
      });
      destinations.push(destination);

      countryDestinations.push({
        slug: vd.slug,
        name: vd.name,
        lat: vd.lat,
        lng: vd.lng,
        status: trend.status,
        interestScore: trend.interestScore,
        growthPct: trend.growthPct,
        weeklyMentions: trend.weeklyMentions,
        topSourceMarkets: countryMarkets,
      });
    }

    countries.push(
      countrySchema.parse({
        iso2: vocab.iso2,
        name: vocab.name,
        centroid: vocab.centroid,
        bounds: vocab.bounds,
        covered: true,
        inboundFlows,
        destinations: countryDestinations,
      }),
    );
  }

  // --- world.json --------------------------------------------------------
  const coveredIso2s = new Set(countries.map((c) => c.iso2));
  const worldCountryMap = new Map(
    flows.countries.map((c) => [c.iso2, { ...c, covered: coveredIso2s.has(c.iso2) }]),
  );
  // Defensive: a covered country should appear even if the flights stage never
  // heard of it (e.g. an island nation with no OpenFlights routes recorded).
  for (const c of countries) {
    if (!worldCountryMap.has(c.iso2)) {
      worldCountryMap.set(c.iso2, {
        iso2: c.iso2,
        name: c.name,
        lat: c.centroid.lat,
        lng: c.centroid.lng,
        covered: true,
      });
    }
  }
  const worldCountries = Array.from(worldCountryMap.values());

  const worldFlows = [...flows.flows].sort((a, b) => b.weight - a.weight).slice(0, 300);

  // Rank by movement weighted by volume — NOT by growth percentage, which puts
  // every zero-baseline destination at the top and reads as noise. `recent` and
  // `baseline` come straight from the trend stage's own maths.
  const rankScoreBySlug = new Map(
    trends.results.map((t) => [t.slug, (t.recent - t.baseline) * Math.log10(t.recent + 10)]),
  );
  const emerging = destinations
    .filter((d) => d.status === 'emerging' || d.status === 'new')
    .sort((a, b) => (rankScoreBySlug.get(b.slug) ?? 0) - (rankScoreBySlug.get(a.slug) ?? 0))
    .slice(0, 30)
    .map((d, i) => ({
      slug: d.slug,
      name: d.name,
      countryIso2: d.countryIso2,
      countryName: d.countryName,
      lat: d.lat,
      lng: d.lng,
      growthPct: d.growthPct,
      status: d.status,
      rank: i + 1,
      blurb: d.blurb,
      image: d.image,
    }));

  const world = worldSchema.parse({ countries: worldCountries, flows: worldFlows, emerging });

  const meta = metaSchema.parse({
    generatedAt,
    schemaVersion: 1,
    countries: countries.map((c) => c.iso2).sort(),
    weekStarts: weekStarts.length === WEEKS_OF_HISTORY ? weekStarts : trends.weekStarts,
    sources: {
      flights: flows.source,
      social: 'Bluesky public search API (public posts only)',
    },
  });

  assertNoDanglingReferences({ meta, world, countries, destinations });

  return { meta, world, countries, destinations };
}

/**
 * Flight-derived source markets are only known at country granularity (the
 * flights stage has no per-destination breakdown), so every destination in a
 * country shares the same flight-basis candidates; social-derived markets come
 * from that specific destination's own `socialOrigins`, which IS per-destination.
 */
function buildSourceMarkets(
  enrich: EnrichmentArtifact | undefined,
  inboundFlows: { fromIso2: string; fromName: string; weight: number }[],
  countryNameByIso2: Map<string, string>,
  trend: TrendDirection,
): { destMarkets: DestinationSourceMarket[]; countryMarkets: SourceMarket[] } {
  const socialEntries = Object.entries(enrich?.socialOrigins ?? {}).sort((a, b) => b[1] - a[1]);

  const seen = new Set<string>();
  const destMarkets: DestinationSourceMarket[] = [];

  for (const [iso2] of socialEntries) {
    if (destMarkets.length >= 6) break;
    if (seen.has(iso2)) continue;
    seen.add(iso2);
    destMarkets.push({ iso2, name: countryNameByIso2.get(iso2) ?? iso2, basis: 'social', trend });
  }
  for (const f of inboundFlows) {
    if (destMarkets.length >= 6) break;
    if (seen.has(f.fromIso2)) continue;
    seen.add(f.fromIso2);
    destMarkets.push({ iso2: f.fromIso2, name: f.fromName, basis: 'flights', trend });
  }

  const countryMarkets: SourceMarket[] = destMarkets
    .slice(0, 4)
    .map(({ iso2, name, basis }) => ({ iso2, name, basis }));

  return { destMarkets, countryMarkets };
}

/**
 * A dangling reference here (a listed slug/iso2 with no corresponding file) would
 * break the app at load time, so this is checked as a hard build-time invariant
 * rather than trusted to callers.
 */
function assertNoDanglingReferences(output: AssembleOutput): void {
  const destSlugs = new Set(output.destinations.map((d) => d.slug));
  for (const c of output.countries) {
    for (const row of c.destinations) {
      if (!destSlugs.has(row.slug)) {
        throw new Error(
          `assemble: country ${c.iso2} lists destination "${row.slug}" with no snapshot`,
        );
      }
    }
  }
  const countryIso2s = new Set(output.countries.map((c) => c.iso2));
  for (const iso2 of output.meta.countries) {
    if (!countryIso2s.has(iso2)) {
      throw new Error(`assemble: meta.countries lists "${iso2}" with no country snapshot`);
    }
  }
  for (const e of output.world.emerging) {
    if (!destSlugs.has(e.slug)) {
      throw new Error(
        `assemble: world.emerging references "${e.slug}" with no destination snapshot`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Writing to disk
// ---------------------------------------------------------------------------

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function assertBudget(label: string, value: unknown, budget: number): void {
  const size = byteSize(value);
  if (size > budget) {
    throw new Error(`${label} is ${size} bytes, over its ${budget}-byte budget`);
  }
}

function mergeMeta(existing: Meta | undefined, next: Meta): Meta {
  const countries = Array.from(new Set([...(existing?.countries ?? []), ...next.countries])).sort();
  return { ...next, countries };
}

/**
 * Merges a run's world.json against whatever is already on disk, so a partial
 * run (`COUNTRIES=TH,JP`) refreshes only the countries/destinations it touched.
 *
 * `flows` is treated as a full recompute every run (Agent D's flight stage is
 * global and doesn't take a country filter — it's "rarely re-run" precisely
 * because it always covers the whole network), so the new run's flows win
 * outright rather than being merged entry-by-entry.
 *
 * `emerging` for touched countries is replaced with this run's freshly-ranked
 * entries; untouched countries' existing entries are kept as-is. Known gap: a
 * kept-and-refreshed union can't be perfectly re-ranked together, because the
 * raw (recent-baseline)*log(volume) score behind an old entry's rank isn't
 * persisted in world.json — only `growthPct` survives across runs. Cross-run
 * partial-merge ordering therefore falls back to `growthPct` as a coarse tie
 * -breaker; a full run (the common case, and the one under test) always uses the
 * correct volume-weighted score. Flagged for Agent G to reconsider in Wave 2 —
 * e.g. persist the raw score, or always recompute trends for the full country
 * set even on a "partial" content refresh.
 */
function mergeWorld(existing: World | undefined, next: World, touchedIso2s: Set<string>): World {
  if (!existing) return next;

  const countryMap = new Map(existing.countries.map((c) => [c.iso2, c]));
  for (const c of next.countries) {
    // A partial run computes `covered` from the countries IT processed, so left
    // alone it demotes every country it skipped. That is how Morocco, Brazil and
    // six others went grey on the globe after a Thailand+Japan run, despite
    // their snapshots still being on disk. Only a country this run actually
    // touched may change its own coverage.
    const previous = countryMap.get(c.iso2);
    const covered = touchedIso2s.has(c.iso2) ? c.covered : (previous?.covered ?? c.covered);
    countryMap.set(c.iso2, { ...c, covered });
  }

  const keptExisting = existing.emerging.filter((e) => !touchedIso2s.has(e.countryIso2));
  const emerging = [...keptExisting, ...next.emerging]
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, 30)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return { countries: Array.from(countryMap.values()), flows: next.flows, emerging };
}

export type WriteSnapshotsOptions = {
  /** Override for tests; defaults to the repo's real `data/` directory. */
  dataDir?: string;
};

/**
 * Writes the snapshot set to `data/`. Validates and size-budgets every file
 * before writing anything, so a failure never leaves a half-written set on disk.
 * Never deletes files for countries/destinations outside this run — that's what
 * makes a partial run (`COUNTRIES=TH,JP`) safe.
 */
export function writeSnapshots(output: AssembleOutput, opts: WriteSnapshotsOptions = {}): void {
  const dataDir = opts.dataDir ?? DATA_DIR;
  const metaPath = join(dataDir, 'meta.json');
  const worldPath = join(dataDir, 'world.json');

  const existingMeta = existsSync(metaPath) ? readJson(metaPath, metaSchema) : undefined;
  const existingWorld = existsSync(worldPath) ? readJson(worldPath, worldSchema) : undefined;

  const touchedIso2s = new Set(output.countries.map((c) => c.iso2));
  const mergedMeta = metaSchema.parse(mergeMeta(existingMeta, output.meta));
  const mergedWorld = worldSchema.parse(mergeWorld(existingWorld, output.world, touchedIso2s));
  assertBudget('data/world.json', mergedWorld, SIZE_BUDGETS.world);

  const parsedCountries = output.countries.map((c) => {
    const parsed = countrySchema.parse(c);
    assertBudget(`data/country/${c.iso2}.json`, parsed, SIZE_BUDGETS.country);
    return parsed;
  });
  const parsedDestinations = output.destinations.map((d) => {
    const parsed = destinationSchema.parse(d);
    assertBudget(`data/destination/${d.slug}.json`, parsed, SIZE_BUDGETS.destination);
    return parsed;
  });

  writeJson(metaPath, metaSchema, mergedMeta);
  writeJson(worldPath, worldSchema, mergedWorld);
  for (const c of parsedCountries) {
    writeJson(join(dataDir, 'country', `${c.iso2}.json`), countrySchema, c);
  }
  for (const d of parsedDestinations) {
    writeJson(join(dataDir, 'destination', `${d.slug}.json`), destinationSchema, d);
  }

  const pruned = pruneOrphanSnapshots(dataDir, mergedMeta);

  log.step(
    'assemble',
    `wrote meta, world, ${parsedCountries.length} countries, ${parsedDestinations.length} destinations` +
      (pruned ? `; pruned ${pruned} stale files` : ''),
  );
}

/**
 * Deletes snapshots nothing references any more.
 *
 * Two ways they accumulate: fixture data for a destination the curated
 * vocabulary later dropped, and countries removed from coverage. Left in place
 * they are invisible — no screen links to them — but they are still fetchable by
 * URL and still fake, so a real run should carry them out rather than leaving
 * seed data lying around in a launched product.
 *
 * Only files under `country/` and `destination/` are considered, and a country
 * still listed in `meta.countries` is always kept.
 */
function pruneOrphanSnapshots(dataDir: string, meta: Meta): number {
  const countryDir = join(dataDir, 'country');
  const destDir = join(dataDir, 'destination');
  if (!existsSync(countryDir) || !existsSync(destDir)) return 0;

  const keepCountries = new Set(meta.countries);
  let removed = 0;

  for (const file of readdirSync(countryDir)) {
    if (!file.endsWith('.json')) continue;
    if (keepCountries.has(file.replace('.json', ''))) continue;
    rmSync(join(countryDir, file));
    removed++;
  }

  // A destination is live only if a surviving country snapshot still lists it.
  const liveSlugs = new Set<string>();
  for (const file of readdirSync(countryDir)) {
    if (!file.endsWith('.json')) continue;
    for (const d of readJson(join(countryDir, file), countrySchema).destinations) {
      liveSlugs.add(d.slug);
    }
  }
  for (const file of readdirSync(destDir)) {
    if (!file.endsWith('.json')) continue;
    if (liveSlugs.has(file.replace('.json', ''))) continue;
    rmSync(join(destDir, file));
    removed++;
  }

  return removed;
}
