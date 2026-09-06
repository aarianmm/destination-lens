/**
 * AGENT E owns this module.
 *
 * Pure maths, no LLM: weekly mention counts in, status/growth/interest out.
 * Deterministic and unit-tested — this is the part of the product that decides
 * what counts as "emerging", so it must never be a judgement call by a model.
 */
import type { DestinationStatus, TrendResult } from '@dl/shared';

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

export function classify(
  _input: TrendInput,
  _thresholds?: TrendThresholds,
): Omit<TrendResult, 'interestScore'> & { status: DestinationStatus } {
  throw new Error('classify not implemented — Agent E');
}

/** Adds within-country interest percentiles across a set of classified destinations. */
export function scoreCountry(_results: Omit<TrendResult, 'interestScore'>[]): TrendResult[] {
  throw new Error('scoreCountry not implemented — Agent E');
}
