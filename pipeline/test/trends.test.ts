import { describe, expect, it } from 'vitest';
import { WEEKS_OF_HISTORY } from '@dl/shared';
import {
  classify,
  scoreCountry,
  MAX_GROWTH_PCT,
  MIN_GROWTH_PCT,
  type ClassifiedTrend,
} from '../src/trends/index.js';

/** Builds a 26-week series: 22 baseline weeks then 4 recent weeks. */
function series(baselineWeeks: number[], recentWeeks: number[]): number[] {
  const baseline = baselineWeeks.length === 1 ? Array(22).fill(baselineWeeks[0]) : baselineWeeks;
  const recent = recentWeeks.length === 1 ? Array(4).fill(recentWeeks[0]) : recentWeeks;
  const weekly = [...baseline, ...recent];
  expect(weekly.length).toBe(WEEKS_OF_HISTORY);
  return weekly;
}

const INPUT = (weeklyMentions: number[]) => ({
  slug: 'test-dest',
  countryIso2: 'TH',
  weeklyMentions,
});

describe('classify', () => {
  it('flags a clean spike as emerging', () => {
    // Steady baseline around 10/wk, then a clear step up to ~41/wk.
    const weekly = series(
      [8, 10, 12, 9, 11, 10, 9, 11, 10, 12, 8, 10, 11, 9, 10, 12, 9, 11, 10, 9, 11, 10],
      [40, 42, 38, 44],
    );
    const result = classify(INPUT(weekly));
    expect(result.status).toBe('emerging');
    expect(result.growthPct).toBeGreaterThan(50);
    expect(result.zScore).toBeGreaterThan(2);
  });

  it('calls flat noise quiet, not emerging or declining', () => {
    const weekly = series(
      [19, 21, 20, 22, 18, 20, 21, 19, 20, 22, 18, 20, 21, 19, 20, 22, 18, 20, 21, 19, 20, 21],
      [21, 20, 22, 21],
    );
    const result = classify(INPUT(weekly));
    expect(result.status).toBe('quiet');
  });

  it('flags a real decline', () => {
    const weekly = series([50], [20, 18, 22, 20]);
    const result = classify(INPUT(weekly));
    expect(result.status).toBe('declining');
    expect(result.growthPct).toBeLessThan(-35);
  });

  it('does NOT call tiny-volume growth emerging (3/wk -> 7/wk stays below the volume floor)', () => {
    // +133% growth, and z is large because baseline has zero variance — but
    // recent (7) never clears the minRecentWeekly=8 floor, which is the whole
    // point of the floor: this must not read as a hot destination.
    const weekly = series([3], [7, 7, 7, 7]);
    const result = classify(INPUT(weekly));
    expect(result.status).not.toBe('emerging');
    expect(result.status).toBe('quiet');
  });

  it('classifies a zero baseline with real recent volume as new, not emerging', () => {
    const weekly = series([0], [10, 10, 10, 10]);
    const result = classify(INPUT(weekly));
    expect(result.status).toBe('new');
    expect(result.baseline).toBe(0);
  });

  it('does not call a zero baseline "new" if recent volume is still below the floor', () => {
    const weekly = series([0], [3, 3, 3, 3]);
    const result = classify(INPUT(weekly));
    expect(result.status).toBe('quiet');
  });

  it('handles all-zero history as quiet with zero growth', () => {
    const weekly = series([0], [0, 0, 0, 0]);
    const result = classify(INPUT(weekly));
    expect(result.status).toBe('quiet');
    expect(result.growthPct).toBe(0);
    expect(result.zScore).toBe(0);
  });

  it('a single non-zero week in the recent window can still trigger "new"', () => {
    const weekly = series(Array(22).fill(0), [40, 0, 0, 0]);
    const result = classify(INPUT(weekly));
    expect(result.status).toBe('new');
  });

  it('a single non-zero week in the baseline does not trigger a false decline', () => {
    const baseline = Array(22).fill(0);
    baseline[10] = 50;
    const weekly = series(baseline, [0, 0, 0, 0]);
    const result = classify(INPUT(weekly));
    // baseline mean (~2.3) is below the minBaselineForDecline floor of 8, so a
    // -100% swing from one stray baseline blip must not read as "declining".
    expect(result.status).not.toBe('declining');
    expect(result.status).toBe('quiet');
  });

  it('clamps growthPct to the documented -100..400 range', () => {
    // baseline=1 (at the "not new" boundary), recent=100 -> raw growth ~9900%.
    const weekly = series([1], [100, 100, 100, 100]);
    const result = classify(INPUT(weekly));
    expect(result.growthPct).toBe(MAX_GROWTH_PCT);
    expect(result.status).toBe('emerging');
  });

  it('never reports growthPct below MIN_GROWTH_PCT', () => {
    const weekly = series([80], [0, 0, 0, 0]);
    const result = classify(INPUT(weekly));
    expect(result.growthPct).toBeGreaterThanOrEqual(MIN_GROWTH_PCT);
    expect(result.growthPct).toBe(-100);
  });

  it('throws on the wrong number of weeks', () => {
    expect(() => classify(INPUT([1, 2, 3]))).toThrow();
  });
});

describe('scoreCountry', () => {
  function quiet(slug: string, recent: number): ClassifiedTrend {
    return {
      slug,
      countryIso2: 'TH',
      status: 'quiet',
      growthPct: 0,
      zScore: 0,
      baseline: recent,
      recent,
      weeklyMentions: Array(WEEKS_OF_HISTORY).fill(Math.round(recent)),
    };
  }

  it('assigns percentile interestScore within a country and promotes the top-quartile quiet destination to established', () => {
    const results = [quiet('low', 5), quiet('mid', 10), quiet('high2', 20), quiet('top', 100)];
    const scored = scoreCountry(results);
    const byslug = new Map(scored.map((r) => [r.slug, r]));

    expect(byslug.get('low')!.interestScore).toBe(0);
    expect(byslug.get('top')!.interestScore).toBe(100);
    // Only the top of 4 clears the top-quartile (>=75) promotion bar.
    expect(byslug.get('top')!.status).toBe('established');
    expect(byslug.get('high2')!.status).toBe('quiet');
    expect(byslug.get('low')!.status).toBe('quiet');
  });

  it('gives a lone destination interestScore=100', () => {
    const scored = scoreCountry([quiet('solo', 42)]);
    expect(scored[0]!.interestScore).toBe(100);
  });

  it('never promotes a non-quiet status even at top-quartile volume', () => {
    const emerging: ClassifiedTrend = {
      ...quiet('spike', 100),
      status: 'emerging',
    };
    const scored = scoreCountry([quiet('low', 1), emerging]);
    expect(scored.find((r) => r.slug === 'spike')!.status).toBe('emerging');
  });

  it('scores each country independently when given a mixed batch', () => {
    const results = [quiet('th-a', 10), quiet('th-b', 100), quiet('jp-a', 10)];
    results[2]!.countryIso2 = 'JP';
    const scored = scoreCountry(results);
    // jp-a is alone in its country, so it gets 100 despite the same raw
    // volume as th-a, which is the bottom of a two-destination TH group.
    expect(scored.find((r) => r.slug === 'jp-a')!.interestScore).toBe(100);
    expect(scored.find((r) => r.slug === 'th-a')!.interestScore).toBe(0);
  });
});
