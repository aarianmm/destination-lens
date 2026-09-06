/**
 * AGENT F owns this module.
 *
 * Batched Gemini Flash-Lite classification and per-destination synthesis.
 * Rules that are not negotiable:
 *  - strict JSON output, zod-validated, one retry, then skip the batch
 *  - a hard cap on calls per run: exceeding it aborts the run rather than overspending
 *  - the model never decides what is trending; it only classifies, clusters and phrases
 *  - poster origin comes from explicit profile location strings, never model guesswork
 */
import type { EnrichmentArtifact, MentionsArtifact, TrendResult } from '@dl/shared';

export type EnrichOptions = {
  mentions: MentionsArtifact;
  trend: TrendResult;
  destinationName: string;
  countryName: string;
};

export type LlmBudget = {
  used: number;
  max: number;
};

export async function enrichDestination(
  _options: EnrichOptions,
  _budget: LlmBudget,
): Promise<EnrichmentArtifact> {
  throw new Error('enrichDestination not implemented — Agent F');
}

/** Wikipedia REST lead image. Returns undefined rather than throwing when absent. */
export async function fetchLeadImage(
  _wikipediaTitle: string,
): Promise<{ url: string; attribution: string; sourceUrl: string } | undefined> {
  throw new Error('fetchLeadImage not implemented — Agent F');
}
