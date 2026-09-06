/**
 * One end-to-end pass over fixture inputs (schema-valid, no dangling refs), plus
 * the two edge cases that matter operationally: size-budget enforcement, and a
 * partial run not destroying other countries' existing snapshots.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WEEKS_OF_HISTORY,
  countrySchema,
  destinationSchema,
  metaSchema,
  worldSchema,
  type EnrichmentArtifact,
  type FlowsArtifact,
  type MentionsArtifact,
  type TrendResult,
  type TrendsArtifact,
  type Vocab,
} from '@dl/shared';
import { assemble, writeSnapshots, type AssembleInput } from '../src/assemble/index.js';

const WEEK_STARTS = Array.from({ length: WEEKS_OF_HISTORY }, (_, i) =>
  new Date(Date.UTC(2026, 0, 5 + i * 7)).toISOString().slice(0, 10),
);

function weeklySeries(baseline: number, recent: number): number[] {
  return Array.from({ length: WEEKS_OF_HISTORY }, (_, i) => (i < WEEKS_OF_HISTORY - 4 ? baseline : recent));
}

const THAILAND: Vocab = {
  iso2: 'TH',
  name: 'Thailand',
  aliases: [],
  centroid: { lat: 15.87, lng: 100.99 },
  bounds: { north: 20.46, south: 5.61, east: 105.64, west: 97.34 },
  destinations: [
    { slug: 'bangkok', name: 'Bangkok', aliases: [], lat: 13.75, lng: 100.5, wikipediaTitle: 'Bangkok', requireContext: false, negativeKeywords: [] },
    { slug: 'phuket', name: 'Phuket', aliases: [], lat: 7.88, lng: 98.39, wikipediaTitle: 'Phuket province', requireContext: false, negativeKeywords: [] },
    { slug: 'pai', name: 'Pai', aliases: [], lat: 19.36, lng: 98.44, wikipediaTitle: 'Pai, Thailand', requireContext: true, negativeKeywords: [] },
  ],
};

const JAPAN: Vocab = {
  iso2: 'JP',
  name: 'Japan',
  aliases: [],
  centroid: { lat: 36.2, lng: 138.2 },
  bounds: { north: 45.5, south: 24.0, east: 146.0, west: 122.9 },
  destinations: [
    { slug: 'tokyo', name: 'Tokyo', aliases: [], lat: 35.68, lng: 139.65, wikipediaTitle: 'Tokyo', requireContext: false, negativeKeywords: [] },
    { slug: 'kyoto', name: 'Kyoto', aliases: [], lat: 35.01, lng: 135.77, wikipediaTitle: 'Kyoto', requireContext: false, negativeKeywords: [] },
  ],
};

function makeFlows(countries: { iso2: string; name: string; lat: number; lng: number }[]): FlowsArtifact {
  return {
    generatedAt: '2026-09-06T03:00:00.000Z',
    source: 'TEST FIXTURE — not a real route network',
    countries: [...countries, { iso2: 'GB', name: 'United Kingdom', lat: 54, lng: -2 }],
    flows: [
      { fromIso2: 'GB', toIso2: 'TH', weight: 1 },
      { fromIso2: 'GB', toIso2: 'JP', weight: 0.6 },
    ],
    inboundByCountry: {
      TH: [{ fromIso2: 'GB', fromName: 'United Kingdom', weight: 1 }],
      JP: [{ fromIso2: 'GB', fromName: 'United Kingdom', weight: 0.6 }],
    },
  };
}

function trend(overrides: Partial<TrendResult>): TrendResult {
  return {
    slug: 'x',
    countryIso2: 'TH',
    status: 'established',
    growthPct: 0,
    zScore: 0,
    interestScore: 50,
    baseline: 10,
    recent: 10,
    weeklyMentions: weeklySeries(10, 10),
    ...overrides,
  };
}

// Bangkok: huge % growth off a tiny base (900%) — if ranking used growthPct
// alone, this would wrongly top the emerging feed over Tokyo's real volume move.
const bangkokTrend = trend({
  slug: 'bangkok',
  countryIso2: 'TH',
  status: 'emerging',
  growthPct: 900,
  baseline: 5,
  recent: 50,
  weeklyMentions: weeklySeries(5, 50),
});
// Tokyo: modest % growth (30%) but a much larger absolute/volume-weighted move.
const tokyoTrend = trend({
  slug: 'tokyo',
  countryIso2: 'JP',
  status: 'emerging',
  growthPct: 30,
  baseline: 200,
  recent: 260,
  weeklyMentions: weeklySeries(200, 260),
});
const phuketTrend = trend({ slug: 'phuket', countryIso2: 'TH', status: 'established', baseline: 150, recent: 150, weeklyMentions: weeklySeries(150, 150) });
const paiTrend = trend({ slug: 'pai', countryIso2: 'TH', status: 'quiet', baseline: 2, recent: 2, weeklyMentions: weeklySeries(2, 2) });
const kyotoTrend = trend({ slug: 'kyoto', countryIso2: 'JP', status: 'established', baseline: 90, recent: 90, weeklyMentions: weeklySeries(90, 90) });

function makeTrendsArtifact(results: TrendResult[]): TrendsArtifact {
  return { generatedAt: '2026-09-06T03:00:00.000Z', weekStarts: WEEK_STARTS, results };
}

function makeMentions(slug: string, countryIso2: string, uris: string[]): MentionsArtifact {
  return {
    slug,
    countryIso2,
    weekStarts: WEEK_STARTS,
    weeklyCounts: weeklySeries(10, 10),
    posts: uris.map((uri, i) => ({
      uri,
      url: `https://bsky.app/profile/traveller${i}.bsky.social/post/${i}`,
      text: `Post ${i} about ${slug} — quiet, would recommend the beaches.`,
      authorHandle: `traveller${i}.bsky.social`,
      postedAt: '2026-08-15T00:00:00.000Z',
    })),
    prefilteredOut: 3,
  };
}

function makeEnrichment(slug: string, quoteUris: string[]): EnrichmentArtifact {
  return {
    slug,
    synthesis: {
      blurb: `Conversation about ${slug} highlights value and quieter beaches.`,
      themes: [{ emoji: '🏝️', label: 'Beaches', weight: 0.9 }],
      positive: ['Quieter than nearby hotspots'],
      negative: [],
      quoteUris,
    },
    socialOrigins: { GB: 3 },
    llmCalls: 2,
  };
}

function fullInput(): AssembleInput {
  const mentions = new Map<string, MentionsArtifact>([
    ['bangkok', makeMentions('bangkok', 'TH', ['uri-bkk-1', 'uri-bkk-2'])],
    ['tokyo', makeMentions('tokyo', 'JP', ['uri-tky-1'])],
  ]);
  const enrichment = new Map<string, EnrichmentArtifact>([
    ['bangkok', makeEnrichment('bangkok', ['uri-bkk-1'])],
    ['tokyo', makeEnrichment('tokyo', ['uri-tky-1'])],
    // phuket/pai/kyoto deliberately have no enrichment entry at all.
  ]);
  return {
    flows: makeFlows([
      { iso2: 'TH', name: 'Thailand', lat: 15.87, lng: 100.99 },
      { iso2: 'JP', name: 'Japan', lat: 36.2, lng: 138.2 },
    ]),
    trends: makeTrendsArtifact([bangkokTrend, phuketTrend, paiTrend, tokyoTrend, kyotoTrend]),
    vocabs: [THAILAND, JAPAN],
    mentions,
    enrichment,
    weekStarts: WEEK_STARTS,
    generatedAt: '2026-09-06T03:00:00.000Z',
  };
}

describe('assemble', () => {
  it('produces a fully schema-valid snapshot set with no dangling cross-references', () => {
    const output = assemble(fullInput());

    expect(() => metaSchema.parse(output.meta)).not.toThrow();
    expect(() => worldSchema.parse(output.world)).not.toThrow();
    for (const c of output.countries) expect(() => countrySchema.parse(c)).not.toThrow();
    for (const d of output.destinations) expect(() => destinationSchema.parse(d)).not.toThrow();

    const destSlugs = new Set(output.destinations.map((d) => d.slug));
    const countryIso2s = new Set(output.countries.map((c) => c.iso2));
    for (const e of output.world.emerging) expect(destSlugs.has(e.slug)).toBe(true);
    for (const c of output.countries) for (const row of c.destinations) expect(destSlugs.has(row.slug)).toBe(true);
    for (const iso2 of output.meta.countries) expect(countryIso2s.has(iso2)).toBe(true);

    // A destination with no enrichment entry at all still gets a valid snapshot:
    // empty blurb, empty quotes — never fabricated, never a crash.
    const pai = output.destinations.find((d) => d.slug === 'pai')!;
    expect(pai.blurb).toBe('');
    expect(pai.sentiment.quotes).toEqual([]);

    // A destination WITH enrichment gets its quote hydrated from the matching
    // mentions post (text/url/postedAt), not just the bare quoteUri.
    const bangkok = output.destinations.find((d) => d.slug === 'bangkok')!;
    expect(bangkok.sentiment.quotes).toHaveLength(1);
    expect(bangkok.sentiment.quotes[0]?.url).toBe('https://bsky.app/profile/traveller0.bsky.social/post/0');

    // Ranking is volume-weighted movement, not raw growthPct: Bangkok's 900%
    // growth off a tiny base must NOT outrank Tokyo's much larger absolute move.
    expect(output.world.emerging[0]?.slug).toBe('tokyo');
    expect(output.world.emerging.map((e) => e.slug)).toContain('bangkok');
    expect(output.world.emerging.some((e) => e.slug === 'phuket' || e.slug === 'pai')).toBe(false);
  });
});

describe('writeSnapshots', () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('enforces the country size budget', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'dl-assemble-budget-'));

    // Pad one country with far more destinations than any real curated country
    // would have, until its serialized file blows past the 150KB budget.
    const padded: Vocab = {
      ...THAILAND,
      destinations: Array.from({ length: 600 }, (_, i) => ({
        slug: `pad-${i}`,
        name: `Padding Destination Number ${i}`,
        aliases: [],
        lat: 10 + i * 0.001,
        lng: 100 + i * 0.001,
        wikipediaTitle: `Padding Destination Number ${i}`,
        requireContext: false,
        negativeKeywords: [],
      })),
    };
    const paddedTrends = padded.destinations.map((d) =>
      trend({ slug: d.slug, countryIso2: 'TH', status: 'established', baseline: 50, recent: 50, weeklyMentions: weeklySeries(50, 50) }),
    );

    const input = fullInput();
    const output = assemble({
      ...input,
      vocabs: [padded, JAPAN],
      trends: makeTrendsArtifact([...paddedTrends, tokyoTrend, kyotoTrend]),
    });

    expect(() => writeSnapshots(output, { dataDir })).toThrow(/budget/i);
  });

  it('does not destroy another country\'s existing snapshots on a partial run', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'dl-assemble-partial-'));

    // First, a full run covering both countries.
    writeSnapshots(assemble(fullInput()), { dataDir });
    const kyotoBefore = readFileSync(join(dataDir, 'country', 'JP.json'), 'utf8');
    const tokyoBefore = readFileSync(join(dataDir, 'destination', 'tokyo.json'), 'utf8');

    // Then a partial re-run for Thailand only (as COUNTRIES=TH would produce).
    const thOnlyInput: AssembleInput = {
      ...fullInput(),
      flows: makeFlows([{ iso2: 'TH', name: 'Thailand', lat: 15.87, lng: 100.99 }]),
      vocabs: [THAILAND],
      trends: makeTrendsArtifact([bangkokTrend, phuketTrend, paiTrend]),
      mentions: new Map([['bangkok', makeMentions('bangkok', 'TH', ['uri-bkk-1', 'uri-bkk-2'])]]),
      enrichment: new Map([['bangkok', makeEnrichment('bangkok', ['uri-bkk-1'])]]),
    };
    writeSnapshots(assemble(thOnlyInput), { dataDir });

    // Japan's snapshots must be byte-identical — the partial run never touched them.
    expect(readFileSync(join(dataDir, 'country', 'JP.json'), 'utf8')).toBe(kyotoBefore);
    expect(readFileSync(join(dataDir, 'destination', 'tokyo.json'), 'utf8')).toBe(tokyoBefore);

    // meta.countries and world.countries still know about Japan even though this
    // run never mentioned it.
    const meta = metaSchema.parse(JSON.parse(readFileSync(join(dataDir, 'meta.json'), 'utf8')));
    expect(meta.countries).toEqual(['JP', 'TH']);
    const world = worldSchema.parse(JSON.parse(readFileSync(join(dataDir, 'world.json'), 'utf8')));
    expect(world.emerging.some((e) => e.countryIso2 === 'JP')).toBe(true);
    expect(world.emerging.some((e) => e.countryIso2 === 'TH')).toBe(true);
  });
});
