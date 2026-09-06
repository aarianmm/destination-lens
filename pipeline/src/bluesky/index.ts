/**
 * AGENT E owns this module.
 *
 * Collects, from the public Bluesky AppView, (a) weekly mention counts for the
 * trailing 26 weeks — which is what makes trend baselines real on day one — and
 * (b) a sample of recent post texts for qualitative analysis.
 *
 * Must back off on 429s, cache raw responses under CACHE_DIR, and apply the
 * keyword prefilter before anything reaches the LLM stage.
 */
import type { MentionsArtifact, Vocab, VocabDestination } from '@dl/shared';

export type CollectOptions = {
  vocab: Vocab;
  /** Monday-aligned week starts, oldest first, length 26. */
  weekStarts: string[];
  /** How many recent posts to keep per destination after prefiltering. */
  recentPostLimit?: number;
};

export async function collectMentions(_options: CollectOptions): Promise<MentionsArtifact[]> {
  throw new Error('collectMentions not implemented — Agent E');
}

/**
 * Cheap rule-based relevance gate. Runs before any LLM call and is expected to
 * discard the large majority of matched posts (target >= 60%).
 */
export function prefilter(
  _post: { text: string },
  _destination: VocabDestination,
  _countryName: string,
): boolean {
  throw new Error('prefilter not implemented — Agent E');
}
