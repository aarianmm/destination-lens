/**
 * INTERMEDIATE PIPELINE CONTRACTS — also frozen in Wave 0.
 *
 * These are the hand-off shapes between pipeline stages, which is what lets agents
 * D (flights/vocab), E (collector/trends) and F (enrich/assemble) build in parallel
 * without waiting for each other. Each stage reads/writes JSON under `pipeline/artifacts/`
 * (gitignored). Every stage must validate its input on read.
 *
 *   D  vocab/{iso2}.json ────────────────┐
 *      flows.json ──────────────────────┐│
 *   E  mentions/{slug}.json ───────────┐││
 *      trends.json ────────────────────┼┼┼──► F  assemble ──► data/*.json
 *   F  enrichment/{slug}.json ─────────┘││
 */
import { z } from 'zod';
import {
  destinationStatusSchema,
  flowSchema,
  inboundFlowSchema,
  iso2Schema,
  isoDateSchema,
  slugSchema,
  themeSchema,
  WEEKS_OF_HISTORY,
} from './schema.js';

// --- Agent D: vocabulary (shared/vocab/{iso2}.json) -------------------------

export const vocabDestinationSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  /** Alternative spellings/short forms searched alongside `name`. */
  aliases: z.array(z.string().min(1)).default([]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Exact Wikipedia article title, for the lead-image lookup. */
  wikipediaTitle: z.string().min(1),
  /**
   * Homonym guard. When true, a post only counts as a mention if a travel keyword or
   * the country name also appears (e.g. "Nice", "Split", "Java", "Bath").
   */
  requireContext: z.boolean().default(false),
  /** Optional extra words that, if present, disqualify a post ("split screen", "nice guy"). */
  negativeKeywords: z.array(z.string().min(1)).default([]),
});
export type VocabDestination = z.infer<typeof vocabDestinationSchema>;

export const vocabSchema = z.object({
  iso2: iso2Schema,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  centroid: z.object({ lat: z.number(), lng: z.number() }),
  bounds: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number(),
  }),
  destinations: z.array(vocabDestinationSchema).min(1),
});
export type Vocab = z.infer<typeof vocabSchema>;

// --- Agent D: flight flows (pipeline/artifacts/flows.json) ------------------

export const flowsArtifactSchema = z.object({
  generatedAt: z.string().datetime(),
  source: z.string(),
  countries: z.array(
    z.object({ iso2: iso2Schema, name: z.string(), lat: z.number(), lng: z.number() }),
  ),
  /** Global top routes, normalised. */
  flows: z.array(flowSchema),
  /** Per covered country: who flies in. Keyed by iso2. */
  inboundByCountry: z.record(iso2Schema, z.array(inboundFlowSchema)),
});
export type FlowsArtifact = z.infer<typeof flowsArtifactSchema>;

// --- Agent E: collected mentions (pipeline/artifacts/mentions/{slug}.json) --

export const rawPostSchema = z.object({
  uri: z.string().min(1),
  /** Public web URL for the post, used for quote attribution. */
  url: z.string().url(),
  text: z.string(),
  authorHandle: z.string(),
  authorDisplayName: z.string().optional(),
  /** Raw profile location string, if the author published one. Never LLM-guessed. */
  authorLocation: z.string().optional(),
  postedAt: z.string().datetime(),
});
export type RawPost = z.infer<typeof rawPostSchema>;

export const mentionsArtifactSchema = z.object({
  slug: slugSchema,
  countryIso2: iso2Schema,
  weekStarts: z.array(isoDateSchema).length(WEEKS_OF_HISTORY),
  weeklyCounts: z.array(z.number().int().nonnegative()).length(WEEKS_OF_HISTORY),
  /** Recent posts kept for qualitative analysis, newest first, already prefiltered. */
  posts: z.array(rawPostSchema),
  /** How many posts the keyword prefilter discarded — reported for tuning. */
  prefilteredOut: z.number().int().nonnegative(),
});
export type MentionsArtifact = z.infer<typeof mentionsArtifactSchema>;

// --- Agent E: trend results (pipeline/artifacts/trends.json) ----------------

export const trendResultSchema = z.object({
  slug: slugSchema,
  countryIso2: iso2Schema,
  status: destinationStatusSchema,
  /** Percentage. 84 means +84%. */
  growthPct: z.number(),
  zScore: z.number(),
  interestScore: z.number().min(0).max(100),
  baseline: z.number().nonnegative(),
  recent: z.number().nonnegative(),
  weeklyMentions: z.array(z.number().int().nonnegative()).length(WEEKS_OF_HISTORY),
});
export type TrendResult = z.infer<typeof trendResultSchema>;

export const trendsArtifactSchema = z.object({
  generatedAt: z.string().datetime(),
  weekStarts: z.array(isoDateSchema).length(WEEKS_OF_HISTORY),
  results: z.array(trendResultSchema),
});
export type TrendsArtifact = z.infer<typeof trendsArtifactSchema>;

// --- Agent F: LLM outputs ---------------------------------------------------

/** Per-post classification returned by the batched Gemini call. */
export const postClassificationSchema = z.object({
  /** Index of the post within the batch that was sent. */
  i: z.number().int().nonnegative(),
  relevant: z.boolean(),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  themes: z.array(z.string().max(40)).max(4),
  /** Screening flag: toxic, spam, or promotional. Such posts are never quoted. */
  unsuitable: z.boolean().default(false),
});
export type PostClassification = z.infer<typeof postClassificationSchema>;

export const postClassificationBatchSchema = z.object({
  results: z.array(postClassificationSchema),
});

/** Per-destination synthesis returned by a single Gemini call. */
export const synthesisSchema = z.object({
  blurb: z.string().max(400),
  themes: z.array(themeSchema).max(6),
  positive: z.array(z.string().max(120)).max(3),
  negative: z.array(z.string().max(120)).max(3),
  /** URIs of posts the model picked as representative quotes; must exist in the input. */
  quoteUris: z.array(z.string()).max(6),
});
export type Synthesis = z.infer<typeof synthesisSchema>;

export const enrichmentArtifactSchema = z.object({
  slug: slugSchema,
  synthesis: synthesisSchema,
  /** Origin counts inferred ONLY from explicit profile location strings. */
  socialOrigins: z.record(iso2Schema, z.number().int().nonnegative()).default({}),
  llmCalls: z.number().int().nonnegative(),
});
export type EnrichmentArtifact = z.infer<typeof enrichmentArtifactSchema>;
