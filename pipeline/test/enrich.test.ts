/**
 * Edge cases only — the parts of `enrichDestination` where a real Gemini call
 * would misbehave: malformed/fenced JSON, a retry that saves the batch, a retry
 * that doesn't (must degrade, not crash), the hard budget cap, and the two hard
 * safety requirements (never a fabricated quote, never an unsuitable post quoted).
 *
 * No live network call exists anywhere here — `llmCaller` is always a fake queue
 * of canned responses, which is the whole point of making it injectable.
 */
import { describe, expect, it } from 'vitest';
import { WEEKS_OF_HISTORY, type MentionsArtifact, type RawPost, type TrendResult } from '@dl/shared';
import { enrichDestination, type LlmBudget } from '../src/enrich/index.js';
import type { LlmCaller } from '../src/enrich/gemini.js';

function makePost(overrides: Partial<RawPost> = {}): RawPost {
  return {
    uri: 'at://did:plc:test/app.bsky.feed.post/default',
    url: 'https://bsky.app/profile/test.bsky.social/post/default',
    text: 'Loved the beaches here, so much quieter than the mainland.',
    authorHandle: 'test.bsky.social',
    postedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMentions(posts: RawPost[], slug = 'koh-lanta'): MentionsArtifact {
  return {
    slug,
    countryIso2: 'TH',
    weekStarts: Array.from({ length: WEEKS_OF_HISTORY }, (_, i) =>
      new Date(Date.UTC(2026, 0, 5 + i * 7)).toISOString().slice(0, 10),
    ),
    weeklyCounts: Array(WEEKS_OF_HISTORY).fill(10),
    posts,
    prefilteredOut: 0,
  };
}

function makeTrend(overrides: Partial<TrendResult> = {}): TrendResult {
  return {
    slug: 'koh-lanta',
    countryIso2: 'TH',
    status: 'emerging',
    growthPct: 80,
    zScore: 3,
    interestScore: 70,
    baseline: 10,
    recent: 18,
    weeklyMentions: Array(WEEKS_OF_HISTORY).fill(10),
    ...overrides,
  };
}

/** A fake `LlmCaller`: returns queued responses in order, throws if exhausted. */
function queueCaller(responses: string[]): LlmCaller {
  let i = 0;
  return async () => {
    if (i >= responses.length) throw new Error('fake caller: no more queued responses');
    return responses[i++]!;
  };
}

const baseOptions = { destinationName: 'Koh Lanta', countryName: 'Thailand' };
const validClassification = (i: number, opts: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({
    results: [{ i, relevant: true, sentiment: 'positive', themes: ['beaches'], unsuitable: false, ...opts }],
  });
const validSynthesis = (quoteUris: string[] = []) =>
  JSON.stringify({ blurb: 'Visitors highlight quiet beaches.', themes: [], positive: [], negative: [], quoteUris });

describe('enrichDestination', () => {
  it('retries once after malformed JSON, then uses the successful retry', async () => {
    const mentions = makeMentions([makePost({ uri: 'uri-1' })]);
    const caller = queueCaller(['not json at all {{{', validClassification(0), validSynthesis()]);
    const budget: LlmBudget = { used: 0, max: 10 };

    const result = await enrichDestination({ mentions, trend: makeTrend(), llmCaller: caller, ...baseOptions }, budget);

    expect(result.synthesis.blurb).toBe('Visitors highlight quiet beaches.');
    expect(budget.used).toBe(3); // failed classify attempt + successful retry + synthesis
  });

  it('parses JSON wrapped in markdown fences', async () => {
    const mentions = makeMentions([makePost({ uri: 'uri-1' })]);
    const caller = queueCaller([
      '```json\n' + validClassification(0) + '\n```',
      '```\n' + validSynthesis() + '\n```',
    ]);
    const budget: LlmBudget = { used: 0, max: 10 };

    const result = await enrichDestination({ mentions, trend: makeTrend(), llmCaller: caller, ...baseOptions }, budget);

    expect(result.synthesis.blurb).toBe('Visitors highlight quiet beaches.');
    expect(budget.used).toBe(2);
  });

  it('skips a batch without crashing when both classification attempts fail', async () => {
    const mentions = makeMentions([makePost({ uri: 'uri-1' })]);
    const caller = queueCaller(['still not json', 'nope, also not json']);
    const budget: LlmBudget = { used: 0, max: 10 };

    const result = await enrichDestination({ mentions, trend: makeTrend(), llmCaller: caller, ...baseOptions }, budget);

    // No classifications survived, so there's nothing to synthesise from — the
    // destination gets an honest empty result, not a crash and not a 3rd call.
    expect(result.synthesis).toEqual({ blurb: '', themes: [], positive: [], negative: [], quoteUris: [] });
    expect(budget.used).toBe(2);
  });

  it('aborts loudly once the shared call budget is exhausted', async () => {
    // 25 posts => two classification batches (20 + 5), so a budget of 1 lets the
    // first batch through and must hard-stop before the second.
    const posts = Array.from({ length: 25 }, (_, i) => makePost({ uri: `uri-${i}` }));
    const mentions = makeMentions(posts);
    const caller = queueCaller([JSON.stringify({ results: [] })]);
    const budget: LlmBudget = { used: 0, max: 1 };

    await expect(
      enrichDestination({ mentions, trend: makeTrend(), llmCaller: caller, ...baseOptions }, budget),
    ).rejects.toThrow(/budget/i);
  });

  it('drops a quoteUri the model invents that is not among the eligible input posts', async () => {
    const mentions = makeMentions([makePost({ uri: 'real-uri' })]);
    const caller = queueCaller([validClassification(0), validSynthesis(['real-uri', 'fabricated-uri'])]);
    const budget: LlmBudget = { used: 0, max: 10 };

    const result = await enrichDestination({ mentions, trend: makeTrend(), llmCaller: caller, ...baseOptions }, budget);

    expect(result.synthesis.quoteUris).toEqual(['real-uri']);
  });

  it('never lets an unsuitable post surface as a quote, even if the model tries', async () => {
    const mentions = makeMentions([
      makePost({ uri: 'good-uri', text: 'Quiet beaches, loved it.' }),
      makePost({ uri: 'spam-uri', text: 'CLICK HERE for cheap hotel deals!!!' }),
    ]);
    const caller = queueCaller([
      JSON.stringify({
        results: [
          { i: 0, relevant: true, sentiment: 'positive', themes: ['beaches'], unsuitable: false },
          { i: 1, relevant: true, sentiment: 'neutral', themes: ['promo'], unsuitable: true },
        ],
      }),
      validSynthesis(['good-uri', 'spam-uri']),
    ]);
    const budget: LlmBudget = { used: 0, max: 10 };

    const result = await enrichDestination({ mentions, trend: makeTrend(), llmCaller: caller, ...baseOptions }, budget);

    expect(result.synthesis.quoteUris).toEqual(['good-uri']);
  });
});
