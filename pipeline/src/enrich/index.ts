/**
 * AGENT F owns this module.
 *
 * Batched Gemini Flash-Lite classification and per-destination synthesis.
 * Rules that are not negotiable:
 *  - strict JSON output, zod-validated, one retry, then skip the batch
 *  - a hard cap on calls per run: exceeding it aborts the run rather than overspending
 *  - the model never decides what is trending; it only classifies, clusters and phrases
 *  - poster origin comes from explicit profile location strings, never model guesswork
 *  - a post flagged unsuitable (toxic/harassing/sexual/discriminatory/spam/promotional,
 *    or about a person's misfortune rather than about the place) is never fed to
 *    synthesis, so it can never end up quoted
 *  - the model's `unsuitable` call is NOT trusted alone: `screening.ts` applies a
 *    deterministic denylist pass after classification that can only force a post
 *    to unsuitable, never the reverse, so a model that returns confident nonsense
 *    (`unsuitable: false` on plain spam or slurs) cannot get it through anyway
 *  - any quoteUri the model returns that doesn't correspond to a real, eligible input
 *    post is dropped — a fabricated quote attributed to a real person is not an
 *    acceptable failure mode, so this is enforced unconditionally, not just logged
 */
import type { z } from 'zod';
import { type ZodType, type ZodTypeDef } from 'zod';
import {
  enrichmentArtifactSchema,
  postClassificationBatchSchema,
  synthesisSchema,
  type EnrichmentArtifact,
  type MentionsArtifact,
  type RawPost,
  type Synthesis,
  type TrendResult,
} from '@dl/shared';
import { extractJsonText, type LlmCaller } from './gemini.js';
import { inferOriginIso2 } from './origins.js';
import { isDenylisted } from './screening.js';
import { log } from '../lib/log.js';

export type EnrichOptions = {
  mentions: MentionsArtifact;
  trend: TrendResult;
  destinationName: string;
  countryName: string;
  /**
   * The model call, injected. In production this is `createGeminiCaller(...)`
   * from `./gemini.js`, built from `PipelineConfig`; in tests it's a fake queue
   * of canned responses. `enrichDestination` never constructs its own caller,
   * which is what makes the real API a config change rather than a rewrite.
   */
  llmCaller: LlmCaller;
};

export type LlmBudget = {
  used: number;
  max: number;
};

/** How many posts go into a single classification call. */
const CLASSIFY_BATCH_SIZE = 20;
/** How many eligible posts we bother showing the synthesis call. */
const SYNTHESIS_POST_SAMPLE = 60;

type PostClassificationBatch = z.infer<typeof postClassificationBatchSchema>;
type PostClassification = PostClassificationBatch['results'][number];
type ClassifiedPost = RawPost & PostClassification;

/**
 * Runs one model call, validates the JSON it returns, and retries exactly once
 * (with a sterner prompt) if that fails. Returns `undefined` — never throws for a
 * content problem — when both attempts fail, so the caller can skip gracefully.
 * Throws only when the shared call budget is exhausted, which is meant to abort
 * the whole run loudly rather than degrade.
 */
async function callJsonWithRetry<T>(
  caller: LlmCaller,
  prompt: string,
  // Input pinned loose: schemas with `.default(...)` fields have an Output type
  // stricter than their Input type (defaults make a field optional going in,
  // required coming out), which otherwise defeats assignability here.
  schema: ZodType<T, ZodTypeDef, unknown>,
  budget: LlmBudget,
  label: string,
): Promise<{ data: T | undefined; callsUsed: number }> {
  let callsUsed = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (budget.used >= budget.max) {
      throw new Error(
        `LLM call budget exceeded (max=${budget.max}) attempting ${label} (attempt ${attempt + 1})`,
      );
    }
    budget.used += 1;
    callsUsed += 1;

    let raw: string;
    try {
      raw = await caller(
        attempt === 0
          ? prompt
          : `${prompt}\n\nYour previous response could not be parsed as valid JSON matching the schema above. Return ONLY the JSON object, with no commentary and no markdown fences.`,
      );
    } catch (err) {
      log.warn('enrich', `${label}: call failed (attempt ${attempt + 1}): ${describeError(err)}`);
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonText(raw));
    } catch {
      log.warn('enrich', `${label}: malformed JSON on attempt ${attempt + 1}`);
      continue;
    }

    const result = schema.safeParse(parsedJson);
    if (result.success) return { data: result.data, callsUsed };
    log.warn(
      'enrich',
      `${label}: schema validation failed on attempt ${attempt + 1}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return { data: undefined, callsUsed };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function buildClassificationPrompt(
  posts: RawPost[],
  destinationName: string,
  countryName: string,
): string {
  const items = posts.map((p, i) => `${i}: ${clip(p.text, 500)}`).join('\n');
  return `You are screening social media posts that mention the travel destination "${destinationName}" in ${countryName}.

For each numbered post, decide:
- "relevant": true only if the post is genuinely about ${destinationName} as a physical travel destination — not spam, and not an unrelated thing that happens to share the name (a TV show, film, book, game, fictional character, band, or person called "${destinationName}"). When the text gives no travel context, mark it false rather than guessing.
- "sentiment": "positive", "negative", or "neutral" toward ${destinationName} as a place to visit.
- "themes": up to 4 short lowercase keywords for what the post is actually about (e.g. "beaches", "prices", "crowds", "food").
- "unsuitable": true if ANY of the following apply, regardless of "relevant" — such posts are never quoted or summarised publicly, no matter how on-topic:
  - toxic, harassing, hateful, or discriminatory language aimed at a person or group
  - sexual content, or spam/promotional/advertising content
  - the post is really about a specific person (a celebrity sighting, an accident, a personal dispute) rather than about the place itself
  - the post describes someone's personal misfortune, injury, death, or tragedy

Respond with ONLY JSON, exactly this shape, one entry per numbered post:
{"results":[{"i":0,"relevant":true,"sentiment":"positive","themes":["beaches"],"unsuitable":false}]}

Posts:
${items}`;
}

function buildSynthesisPrompt(
  posts: ClassifiedPost[],
  destinationName: string,
  countryName: string,
  trend: TrendResult,
): string {
  const sample = posts
    .slice(0, SYNTHESIS_POST_SAMPLE)
    .map((p) => `[${p.uri}] (${p.sentiment}) ${clip(p.text, 280)}`)
    .join('\n');
  return `You are writing a short, factual travel-intelligence summary for "${destinationName}" in ${countryName}, based ONLY on the ${posts.length} public posts listed below — do not use outside knowledge about ${destinationName}, and do not state anything the posts don't actually support. Every claim must be traceable to something in the posts.

Context (already decided by trend statistics, not by you — do not contradict or re-justify it, just reflect it): online conversation about ${destinationName} is currently classified as "${trend.status}", growth ${Math.round(trend.growthPct)}% versus its baseline.

Write factual, specific copy — never travel-brochure gushing. Banned: "hidden gem", "must-visit", "must-see", "paradise", "breathtaking", "stunning", "bucket list", "off the beaten path", or any sentence that would be equally true of any beach/city/temple destination and isn't actually grounded in what these posts say (bad: "a hidden gem with stunning beaches"; good: "several posts describe quieter beaches than nearby Phuket"). If a sentence could be copy-pasted onto a different destination's page unchanged, rewrite it or cut it.

Respond with ONLY JSON, exactly this shape:
{
  "blurb": "<= 2 sentences, factual and specific",
  "themes": [{"emoji": "🏝️", "label": "Beaches", "weight": 0.9}],
  "positive": ["<= 3 short paraphrases of recurring positive sentiment"],
  "negative": ["<= 3 short paraphrases of recurring negative/critical sentiment"],
  "quoteUris": ["<= 6 values copied EXACTLY from the [bracketed] uris below — never invent one, never alter one"]
}
"themes" has at most 6 entries. Any field with no supporting material should be an empty array.

Posts:
${sample || '(no eligible posts)'}`;
}

const EMPTY_SYNTHESIS: Synthesis = {
  blurb: '',
  themes: [],
  positive: [],
  negative: [],
  quoteUris: [],
};

export async function enrichDestination(
  options: EnrichOptions,
  budget: LlmBudget,
): Promise<EnrichmentArtifact> {
  const { mentions, trend, destinationName, countryName, llmCaller } = options;
  let llmCalls = 0;

  // --- per-post classification, batched ------------------------------------
  const classified: ClassifiedPost[] = [];
  for (let start = 0; start < mentions.posts.length; start += CLASSIFY_BATCH_SIZE) {
    const batch = mentions.posts.slice(start, start + CLASSIFY_BATCH_SIZE);
    const prompt = buildClassificationPrompt(batch, destinationName, countryName);
    const { data, callsUsed } = await callJsonWithRetry<PostClassificationBatch>(
      llmCaller,
      prompt,
      postClassificationBatchSchema,
      budget,
      `classify ${destinationName} [${start}..${start + batch.length})`,
    );
    llmCalls += callsUsed;
    if (!data) {
      log.warn('enrich', `skipping classification batch @${start} for ${destinationName}`);
      continue;
    }
    for (const c of data.results) {
      const post = batch[c.i];
      if (!post) continue; // model returned an out-of-range index — ignore, don't crash
      classified.push({ ...post, ...c });
    }
  }

  // Deterministic backstop: force `unsuitable = true` for anything matching the
  // denylist, regardless of what the model said. This can only tighten the
  // model's call, never loosen it — a model that returns confident nonsense
  // (`unsuitable: false` on plain spam, solicitation, or a misfortune post)
  // cannot get it past this, because the check never consults the model's
  // answer. Applied before `eligible` is computed so there is exactly one
  // choke point downstream of it (see comment below).
  for (const c of classified) {
    if (!c.unsuitable && isDenylisted(c.text)) {
      log.warn(
        'enrich',
        `${destinationName}: deterministic denylist overriding model's unsuitable=false for ${c.uri}`,
      );
      c.unsuitable = true;
    }
  }

  // Unsuitable posts are excluded here, at the source, so there is no path by
  // which one can end up in the synthesis prompt (and therefore no path by which
  // it can end up quoted in the UI).
  const eligible = classified.filter((c) => c.relevant && !c.unsuitable);
  const eligibleUris = new Set(eligible.map((p) => p.uri));

  // --- per-destination synthesis --------------------------------------------
  let synthesis: Synthesis = EMPTY_SYNTHESIS;
  if (eligible.length > 0) {
    const prompt = buildSynthesisPrompt(eligible, destinationName, countryName, trend);
    const { data, callsUsed } = await callJsonWithRetry(
      llmCaller,
      prompt,
      synthesisSchema,
      budget,
      `synthesize ${destinationName}`,
    );
    llmCalls += callsUsed;
    if (data) {
      const invented = data.quoteUris.filter((u) => !eligibleUris.has(u));
      if (invented.length > 0) {
        log.warn(
          'enrich',
          `${destinationName}: dropping ${invented.length} quoteUri(s) the model invented (not in eligible input posts)`,
        );
      }
      synthesis = { ...data, quoteUris: data.quoteUris.filter((u) => eligibleUris.has(u)) };
    } else {
      log.warn('enrich', `skipping synthesis for ${destinationName}`);
    }
  }

  // --- origin garnish: explicit profile locations only, never LLM-guessed ---
  const socialOrigins: Record<string, number> = {};
  for (const post of mentions.posts) {
    const iso2 = inferOriginIso2(post.authorLocation);
    if (!iso2) continue;
    socialOrigins[iso2] = (socialOrigins[iso2] ?? 0) + 1;
  }

  return enrichmentArtifactSchema.parse({
    slug: mentions.slug,
    synthesis,
    socialOrigins,
    llmCalls,
  });
}

export { fetchLeadImage, type LeadImage } from './wikipedia.js';
