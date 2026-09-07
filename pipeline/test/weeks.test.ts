import { describe, expect, it } from 'vitest';
import { weekStartsFor as sharedWeekStartsFor } from '@dl/shared/fixtures';
import { WEEKS_OF_HISTORY } from '@dl/shared';
import { weekStartsFor } from '../src/lib/weeks.js';

// pipeline/src/lib/weeks.ts intentionally duplicates shared/src/fixtures'
// weekStartsFor (real pipeline code shouldn't depend on the fixture-generator
// package) — this test is what keeps the duplicate from silently drifting.
describe('weekStartsFor', () => {
  it('matches the shared fixtures implementation for several dates', () => {
    const dates = [
      new Date('2026-09-07T12:00:00Z'), // a Monday
      new Date('2026-09-10T03:00:00Z'), // a Thursday
      new Date('2026-01-01T00:00:00Z'), // a Thursday, new year
      new Date('2026-12-31T23:59:59Z'),
    ];
    for (const now of dates) {
      expect(weekStartsFor(now)).toEqual(sharedWeekStartsFor(now));
    }
  });

  it('returns WEEKS_OF_HISTORY oldest-first Mondays', () => {
    const starts = weekStartsFor(new Date('2026-09-10T03:00:00Z'));
    expect(starts).toHaveLength(WEEKS_OF_HISTORY);
    expect(starts.at(-1)).toBe('2026-09-07'); // Monday of the current week
    for (const s of starts) {
      const dow = new Date(`${s}T00:00:00.000Z`).getUTCDay();
      expect(dow).toBe(1); // Monday
    }
  });
});
