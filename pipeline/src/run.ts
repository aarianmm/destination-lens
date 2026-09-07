/**
 * Pipeline entry point (Agent G, Wave 2).
 *
 * Sequences every stage end to end: vocab -> flights (committed artifact) ->
 * Bluesky collection -> trend maths -> Gemini enrichment -> Wikipedia imagery
 * -> assemble -> write data/. Each stage's failure mode is chosen deliberately:
 *
 *  - a missing/broken vocab file degrades that COUNTRY out of the run;
 *  - a Bluesky/Wikipedia/enrichment failure for one destination degrades that
 *    DESTINATION out of the run (its mentions/enrichment/image just come back
 *    empty — the assembler already treats those as legitimate "no signal yet"
 *    states, not errors, per its own doc comments);
 *  - exhausting the Gemini call budget aborts the WHOLE run loudly, because
 *    overspending the human's API credit silently is worse than a failed run;
 *  - a missing `GEMINI_API_KEY` on anything other than a dry run is a
 *    configuration error, not something to paper over.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  flowsArtifactSchema,
  trendsArtifactSchema,
  type EnrichmentArtifact,
  type MentionsArtifact,
  type TrendResult,
  type Vocab,
} from '@dl/shared';
import { assemble, writeSnapshots } from './assemble/index.js';
import { collectMentions } from './bluesky/index.js';
import { loadConfig } from './config.js';
import { createGeminiCaller, type LlmCaller } from './enrich/gemini.js';
import { enrichDestination, fetchLeadImage, type LeadImage } from './enrich/index.js';
import { log } from './lib/log.js';
import { loadVocab } from './lib/vocab.js';
import { weekStartsFor } from './lib/weeks.js';
import { classify, scoreCountry, type ClassifiedTrend } from './trends/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FLOWS_PATH = join(here, 'flights', 'flows.generated.json');

/** Tried once if the primary model request fails outright (PLAN.md §4.5). */
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/** Prefix of the error `enrich/index.ts`'s `callJsonWithRetry` throws when the
 * shared call budget is exhausted — matched here to tell "abort the whole run"
 * apart from an ordinary per-destination enrichment failure. */
const BUDGET_EXCEEDED_PREFIX = 'LLM call budget exceeded';

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function loadFlows() {
  const raw = readFileSync(FLOWS_PATH, 'utf8');
  return flowsArtifactSchema.parse(JSON.parse(raw));
}

function logStatusBreakdown(trends: TrendResult[]): void {
  const counts = new Map<string, number>();
  for (const t of trends) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  const summary = [...counts.entries()].map(([status, n]) => `${status}=${n}`).join(' ') || '(none)';
  log.step('trends', `status breakdown: ${summary}`);
}

async function main() {
  const config = loadConfig();
  log.step(
    'run',
    `countries=${config.countries.join(',')} dryRun=${config.dryRun} maxLlmCalls=${config.maxLlmCalls}`,
  );

  // --- vocab -----------------------------------------------------------------
  const vocabs: Vocab[] = [];
  for (const iso2 of config.countries) {
    const vocab = loadVocab(iso2);
    if (vocab) {
      vocabs.push(vocab);
      log.step('vocab', `${iso2}: loaded ${vocab.destinations.length} destinations`);
    }
  }
  if (vocabs.length === 0) {
    throw new Error(`no usable vocab for any of: ${config.countries.join(', ')} — aborting`);
  }

  // --- flights (committed artifact; never re-downloaded per run) -------------
  const flows = loadFlows();
  log.step(
    'flights',
    `loaded committed flows: ${flows.countries.length} countries, ${flows.flows.length} routes`,
  );

  // --- bluesky -----------------------------------------------------------------
  const weekStarts = weekStartsFor(new Date());
  const mentionsBySlug = new Map<string, MentionsArtifact>();
  const countriesWithZeroMentions: string[] = [];
  for (const vocab of vocabs) {
    try {
      const artifacts = await collectMentions({
        vocab,
        weekStarts,
        bskyIdentifier: config.bskyIdentifier,
        bskyAppPassword: config.bskyAppPassword,
      });
      for (const a of artifacts) mentionsBySlug.set(a.slug, a);
      log.step(
        'bluesky',
        `${vocab.iso2}: collected mentions for ${artifacts.length}/${vocab.destinations.length} destinations`,
      );
      if (artifacts.length === 0) countriesWithZeroMentions.push(vocab.iso2);
    } catch (err) {
      // collectMentions already degrades per-destination internally; a throw
      // here means something broke for the whole country (e.g. couldn't build
      // a client at all) — drop that country's destinations from this run
      // rather than losing every country to one bad one.
      log.error(
        'bluesky',
        `${vocab.iso2}: mention collection failed entirely, skipping this country — ${describeError(err)}`,
      );
      countriesWithZeroMentions.push(vocab.iso2);
    }
  }
  // A single bad DESTINATION degrading out is normal and expected (see the
  // per-destination try/catch inside collectMentions). A whole COUNTRY coming
  // back with zero is not — that's a broken run wearing a green checkmark
  // (exactly what happened when `postedAt` validation started rejecting every
  // post: the run "succeeded" having collected nothing). Fail loudly instead
  // of publishing/silently skipping a country that produced no signal at all.
  if (countriesWithZeroMentions.length > 0) {
    throw new Error(
      `bluesky collection produced zero destinations for: ${countriesWithZeroMentions.join(', ')} ` +
        '— treating a country-wide zero as a broken run, not a quiet one',
    );
  }

  // --- trends (pure maths, no LLM) ---------------------------------------------
  const classified: ClassifiedTrend[] = [];
  for (const [slug, mentions] of mentionsBySlug) {
    try {
      classified.push(
        classify({ slug, countryIso2: mentions.countryIso2, weeklyMentions: mentions.weeklyCounts }),
      );
    } catch (err) {
      log.error('trends', `${slug}: classification failed, skipping — ${describeError(err)}`);
    }
  }
  const trends = scoreCountry(classified);
  const trendBySlug = new Map(trends.map((t) => [t.slug, t]));
  log.step('trends', `classified ${trends.length} destinations`);
  logStatusBreakdown(trends);

  // --- gemini enrichment ---------------------------------------------------------
  if (!config.dryRun && !config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required for a non-dry run');
  }
  const llmCaller: LlmCaller | undefined =
    !config.dryRun && config.geminiApiKey
      ? createGeminiCaller({
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          fallbackModel: GEMINI_FALLBACK_MODEL,
        })
      : undefined;

  const budget = { used: 0, max: config.maxLlmCalls };
  const enrichmentBySlug = new Map<string, EnrichmentArtifact>();

  if (config.dryRun) {
    log.step('enrich', 'dry run: skipping Gemini enrichment entirely (no paid calls)');
  } else if (llmCaller) {
    let budgetExceeded = false;
    for (const vocab of vocabs) {
      if (budgetExceeded) break;
      for (const vd of vocab.destinations) {
        if (budgetExceeded) break;
        const mentions = mentionsBySlug.get(vd.slug);
        const trend = trendBySlug.get(vd.slug);
        if (!mentions || !trend) continue; // no signal collected this run — nothing to enrich

        try {
          const artifact = await enrichDestination(
            { mentions, trend, destinationName: vd.name, countryName: vocab.name, llmCaller },
            budget,
          );
          enrichmentBySlug.set(vd.slug, artifact);
        } catch (err) {
          const message = describeError(err);
          if (message.startsWith(BUDGET_EXCEEDED_PREFIX)) {
            // Fail loudly: overspending the human's Gemini budget silently is
            // worse than a failed run. Everything enriched before this point
            // keeps its result — assemble() still produces a valid snapshot
            // for it — but the run as a whole must not report success.
            log.error('enrich', message);
            budgetExceeded = true;
            continue;
          }
          log.error('enrich', `${vd.slug}: enrichment failed, continuing without it — ${message}`);
        }
      }
    }
    log.step('enrich', `used ${budget.used}/${budget.max} Gemini calls`);
    if (budgetExceeded) {
      throw new Error(`Gemini call budget exhausted (${budget.used}/${budget.max}) — aborting run`);
    }
  }

  // --- wikipedia imagery -------------------------------------------------------
  const imagesBySlug = new Map<string, LeadImage | undefined>();
  for (const vocab of vocabs) {
    for (const vd of vocab.destinations) {
      try {
        imagesBySlug.set(vd.slug, await fetchLeadImage(vd.wikipediaTitle));
      } catch (err) {
        // fetchLeadImage degrades internally already and shouldn't throw, but
        // one destination's imagery is never worth losing the run over.
        log.warn(
          'enrich',
          `${vd.slug}: lead image lookup errored, continuing without it — ${describeError(err)}`,
        );
      }
    }
  }
  log.step(
    'enrich',
    `fetched lead images for ${[...imagesBySlug.values()].filter(Boolean).length}/${imagesBySlug.size} destinations`,
  );

  // --- assemble ------------------------------------------------------------------
  const generatedAt = new Date().toISOString();
  const trendsArtifact = trendsArtifactSchema.parse({ generatedAt, weekStarts, results: trends });

  const output = assemble({
    flows,
    trends: trendsArtifact,
    vocabs,
    mentions: mentionsBySlug,
    enrichment: enrichmentBySlug,
    images: imagesBySlug,
    weekStarts,
    generatedAt,
  });

  if (config.dryRun) {
    log.step(
      'run',
      `dry run: not writing snapshots (would write ${output.countries.length} countries, ${output.destinations.length} destinations)`,
    );
  } else {
    writeSnapshots(output);
  }

  log.step(
    'run',
    `done — ${vocabs.length} countries, ${output.destinations.length} destinations, ${budget.used} Gemini calls`,
  );
}

main().catch((err: unknown) => {
  log.error('run', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
