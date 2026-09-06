/**
 * AGENT E owns this module.
 *
 * Pure maths, no LLM: weekly mention counts in, status/growth/interest out.
 * Deterministic and unit-tested — this is the part of the product that decides
 * what counts as "emerging", so it must never be a judgement call by a model.
 *
 * Windowing (PLAN.md §4.6): `weeklyMentions` is oldest-first, length 26.
 *   baseline = mean(weeks -26..-5)  -> the first 22 weeks
 *   recent   = mean(weeks -4..-1)   -> the last 4 weeks
 *   sigma    = population std-dev of the baseline weeks
 *
 * `established` needs to know how a destination's volume ranks against its
 * country's other destinations ("top-quartile volume"), which `classify` alone
 * cannot see — it only gets one destination's series. So `classify` produces
 * every status except `established` (falling back to `quiet`), and
 * `scoreCountry` — which computes the interestScore percentile across a
 * country's destinations anyway — promotes high-volume `quiet` entries to
 * `established`.
 */
import type { DestinationStatus, TrendResult } from '@dl/shared';
import { WEEKS_OF_HISTORY } from '@dl/shared';

export type TrendInput = {
  slug: string;
  countryIso2: string;
  /** Oldest first, length 26. */
  weeklyMentions: number[];
};

export type TrendThresholds = {
  emergingGrowth: number;
  emergingZ: number;
  minRecentWeekly: number;
  decliningGrowth: number;
  minBaselineForDecline: number;
};

export const DEFAULT_THRESHOLDS: TrendThresholds = {
  emergingGrowth: 0.5,
  emergingZ: 2,
  minRecentWeekly: 8,
  decliningGrowth: -0.35,
  minBaselineForDecline: 8,
};

/**
 * A near-zero baseline makes `growthPct` arithmetically true but editorially
 * useless ("+3505%"). `shared/src/fixtures/index.ts` clamps identically —
 * keep the two in lockstep so fixture and real numbers read the same way.
 */
export const MAX_GROWTH_PCT = 400;
export const MIN_GROWTH_PCT = -100;

/** Within-country top-quartile cutoff used to promote `quiet` to `established`. */
const ESTABLISHED_PERCENTILE = 75;

const RECENT_WEEKS = 4;
const BASELINE_WEEKS = WEEKS_OF_HISTORY - RECENT_WEEKS;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function stdDev(xs: number[], avg: number): number {
  if (xs.length === 0) return 0;
  const variance = mean(xs.map((x) => (x - avg) ** 2));
  return Math.sqrt(variance);
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export type ClassifiedTrend = Omit<TrendResult, 'interestScore'> & { status: DestinationStatus };

export function classify(
  input: TrendInput,
  thresholds: TrendThresholds = DEFAULT_THRESHOLDS,
): ClassifiedTrend {
  const { weeklyMentions } = input;
  if (weeklyMentions.length !== WEEKS_OF_HISTORY) {
    throw new Error(
      `classify: expected ${WEEKS_OF_HISTORY} weeks of mentions, got ${weeklyMentions.length}`,
    );
  }

  const baselineWeeks = weeklyMentions.slice(0, BASELINE_WEEKS);
  const recentWeeks = weeklyMentions.slice(BASELINE_WEEKS);

  const baseline = mean(baselineWeeks);
  const recent = mean(recentWeeks);
  const sigma = stdDev(baselineWeeks, baseline);

  const growthRatio = (recent - baseline) / Math.max(baseline, 0.5);
  const growthPct = round(Math.max(MIN_GROWTH_PCT, Math.min(MAX_GROWTH_PCT, growthRatio * 100)));
  const zScore = round((recent - baseline) / Math.max(sigma, 0.5), 2);

  // `new` is checked ahead of `emerging`: a near-zero baseline makes the
  // emerging-style growth/z conditions trivially true (division by the 0.5
  // floor), but "went from nothing to something" is a more specific and more
  // useful story than "grew 50%+", so it wins when both are technically true.
  let status: DestinationStatus;
  if (baseline < 1 && recent >= thresholds.minRecentWeekly) {
    status = 'new';
  } else if (
    growthRatio > thresholds.emergingGrowth &&
    zScore > thresholds.emergingZ &&
    recent >= thresholds.minRecentWeekly
  ) {
    status = 'emerging';
  } else if (
    growthRatio < thresholds.decliningGrowth &&
    baseline >= thresholds.minBaselineForDecline
  ) {
    status = 'declining';
  } else {
    // Possibly promoted to `established` later, once scoreCountry knows how
    // this destination's volume compares to the rest of its country.
    status = 'quiet';
  }

  return {
    slug: input.slug,
    countryIso2: input.countryIso2,
    status,
    growthPct,
    zScore,
    baseline: round(baseline, 2),
    recent: round(recent, 2),
    weeklyMentions: input.weeklyMentions,
  };
}

/**
 * Adds within-country interest percentiles across a set of classified
 * destinations, and promotes top-quartile-volume `quiet` destinations to
 * `established` (PLAN.md §4.6: "established: top-quartile volume, stable").
 *
 * Grouped by `countryIso2` so callers may pass either a single country's
 * results or a mixed batch — percentiles are always computed within each
 * destination's own country, per the `interestScore` field's contract.
 */
export function scoreCountry(results: ClassifiedTrend[]): TrendResult[] {
  const byCountry = new Map<string, ClassifiedTrend[]>();
  for (const r of results) {
    const group = byCountry.get(r.countryIso2);
    if (group) group.push(r);
    else byCountry.set(r.countryIso2, [r]);
  }

  const out: TrendResult[] = [];
  for (const group of byCountry.values()) {
    const sorted = [...group].sort((a, b) => a.recent - b.recent);
    const interestBySlug = new Map<string, number>();
    sorted.forEach((r, idx) => {
      const pct = sorted.length === 1 ? 100 : Math.round((idx / (sorted.length - 1)) * 100);
      interestBySlug.set(r.slug, pct);
    });

    for (const r of group) {
      const interestScore = interestBySlug.get(r.slug) ?? 0;
      const status: DestinationStatus =
        r.status === 'quiet' && interestScore >= ESTABLISHED_PERCENTILE ? 'established' : r.status;
      out.push({ ...r, status, interestScore });
    }
  }
  return out;
}
