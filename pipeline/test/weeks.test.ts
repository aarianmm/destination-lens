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

  it('returns WEEKS_OF_HISTORY oldest-first Mondays, ending at the last COMPLETE week', () => {
    // Thursday 2026-09-10: the current week began Monday the 7th and is still
    // running, so the series must end on Monday the 31st. Including the
    // in-progress week averaged a partial week into "recent" and reported
    // roughly -20 points of phantom decline on every destination.
    const starts = weekStartsFor(new Date('2026-09-10T03:00:00Z'));
    expect(starts).toHaveLength(WEEKS_OF_HISTORY);
    expect(starts.at(-1)).toBe('2026-08-31');
    for (const s of starts) {
      const dow = new Date(`${s}T00:00:00.000Z`).getUTCDay();
      expect(dow).toBe(1); // Monday
    }
  });

  it('never includes the in-progress week, whatever day the run fires', () => {
    // The bias was worst on a Monday but present every day, so check the whole week.
    for (let d = 7; d <= 13; d++) {
      const now = new Date(`2026-09-${String(d).padStart(2, '0')}T03:00:00Z`);
      const starts = weekStartsFor(now);
      const last = new Date(`${starts.at(-1)}T00:00:00.000Z`).getTime();
      // The last week in the series must have finished before `now`.
      expect(last + 7 * 86_400_000).toBeLessThanOrEqual(now.getTime());
    }
  });
});
