/**
 * THE DATA CONTRACT.
 *
 * These schemas define every JSON file published to `data/` and consumed by the app.
 * They are frozen for the MVP: agents must not edit this file. If a change is
 * genuinely needed, raise it with the orchestrator, who updates it in one place and
 * notifies every affected agent.
 *
 * Conventions:
 *  - `iso2`   uppercase ISO 3166-1 alpha-2 country code ("TH")
 *  - `slug`   lowercase kebab destination id, globally unique ("koh-lanta")
 *  - `growthPct` is a PERCENTAGE, not a ratio: 84 means "+84%", -30 means "-30%"
 *  - `weight` is normalised 0..1 within its own list (largest flow = 1)
 *  - `weeklyMentions` is oldest-first and aligned index-for-index with meta.weekStarts
 */
import { z } from 'zod';

export const WEEKS_OF_HISTORY = 26;

export const iso2Schema = z.string().regex(/^[A-Z]{2}$/, 'iso2 must be two uppercase letters');
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case');
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Destination status, decided by the trend maths in `pipeline/src/trends` — never by an LLM.
 * `quiet` is the honest fallback when there is not enough signal to say anything.
 */
export const destinationStatusSchema = z.enum([
  'established',
  'emerging',
  'declining',
  'new',
  'quiet',
]);
export type DestinationStatus = z.infer<typeof destinationStatusSchema>;

/** Where a source-market claim comes from. Drives the UI's honesty labelling. */
export const sourceBasisSchema = z.enum(['flights', 'social']);
export const trendDirectionSchema = z.enum(['up', 'flat', 'down']);

// ---------------------------------------------------------------------------
// data/meta.json
// ---------------------------------------------------------------------------

export const metaSchema = z.object({
  generatedAt: z.string().datetime(),
  schemaVersion: z.literal(1),
  /** iso2 codes with deep (destination-level) coverage. */
  countries: z.array(iso2Schema),
  /** Monday of each week in `weeklyMentions`, oldest first. */
  weekStarts: z.array(isoDateSchema).length(WEEKS_OF_HISTORY),
  sources: z.object({
    flights: z.string(),
    social: z.string(),
  }),
});
export type Meta = z.infer<typeof metaSchema>;

// ---------------------------------------------------------------------------
// data/world.json
// ---------------------------------------------------------------------------

export const worldCountrySchema = z.object({
  iso2: iso2Schema,
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  /** true when data/country/{iso2}.json has destination-level intelligence. */
  covered: z.boolean(),
});

export const flowSchema = z.object({
  fromIso2: iso2Schema,
  toIso2: iso2Schema,
  /** normalised 0..1 across the whole flows list. Route-network derived, NOT passenger volume. */
  weight: z.number().min(0).max(1),
});

/** A globally-ranked emerging destination. Carries enough to render a Discover card unaided. */
export const emergingEntrySchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  countryIso2: iso2Schema,
  countryName: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  growthPct: z.number(),
  status: destinationStatusSchema,
  rank: z.number().int().positive(),
  blurb: z.string().max(400),
  image: z
    .object({ url: z.string().url(), attribution: z.string(), sourceUrl: z.string().url() })
    .optional(),
});

export const worldSchema = z.object({
  countries: z.array(worldCountrySchema),
  flows: z.array(flowSchema).max(300),
  emerging: z.array(emergingEntrySchema).max(40),
});
export type World = z.infer<typeof worldSchema>;

// ---------------------------------------------------------------------------
// data/country/{iso2}.json
// ---------------------------------------------------------------------------

export const sourceMarketSchema = z.object({
  iso2: iso2Schema,
  name: z.string().min(1),
  basis: sourceBasisSchema,
});

export const countryDestinationSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  status: destinationStatusSchema,
  /** 0..100 percentile of recent conversation volume within this country. */
  interestScore: z.number().min(0).max(100),
  growthPct: z.number(),
  weeklyMentions: z.array(z.number().int().nonnegative()).length(WEEKS_OF_HISTORY),
  topSourceMarkets: z.array(sourceMarketSchema).max(4),
});

export const inboundFlowSchema = z.object({
  fromIso2: iso2Schema,
  fromName: z.string().min(1),
  weight: z.number().min(0).max(1),
});

export const countrySchema = z.object({
  iso2: iso2Schema,
  name: z.string().min(1),
  centroid: latLngSchema,
  bounds: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number(),
  }),
  covered: z.boolean(),
  inboundFlows: z.array(inboundFlowSchema).max(20),
  destinations: z.array(countryDestinationSchema),
});
export type Country = z.infer<typeof countrySchema>;

// ---------------------------------------------------------------------------
// data/destination/{slug}.json
// ---------------------------------------------------------------------------

export const themeSchema = z.object({
  emoji: z.string().min(1).max(8),
  label: z.string().min(1).max(40),
  /** 0..1 relative prominence, used for chip ordering/sizing. */
  weight: z.number().min(0).max(1),
});

export const quoteSchema = z.object({
  text: z.string().min(1).max(300),
  url: z.string().url(),
  postedAt: z.string().datetime(),
});

export const destinationSourceMarketSchema = sourceMarketSchema.extend({
  trend: trendDirectionSchema,
});

export const destinationSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  countryIso2: iso2Schema,
  countryName: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  status: destinationStatusSchema,
  growthPct: z.number(),
  interestScore: z.number().min(0).max(100),
  weeklyMentions: z.array(z.number().int().nonnegative()).length(WEEKS_OF_HISTORY),
  /** Gemini-written, <= 2 sentences, factual tone. Empty string if enrichment was skipped. */
  blurb: z.string().max(400),
  themes: z.array(themeSchema).max(6),
  sentiment: z.object({
    positive: z.array(z.string().max(120)).max(3),
    negative: z.array(z.string().max(120)).max(3),
    quotes: z.array(quoteSchema).max(4),
  }),
  sourceMarkets: z.array(destinationSourceMarketSchema).max(6),
  image: z
    .object({ url: z.string().url(), attribution: z.string(), sourceUrl: z.string().url() })
    .optional(),
});
export type Destination = z.infer<typeof destinationSchema>;

// ---------------------------------------------------------------------------
// Size budgets, enforced by the assembler (bytes)
// ---------------------------------------------------------------------------

export const SIZE_BUDGETS = {
  world: 300 * 1024,
  country: 150 * 1024,
  destination: 60 * 1024,
} as const;
