/**
 * AGENT G (Wave 2) glue: Monday-aligned week boundaries for the trailing
 * `WEEKS_OF_HISTORY` weeks, oldest first — the alignment
 * `pipeline/src/bluesky/index.ts`'s `weekWindow()` and every downstream
 * `weeklyMentions` array assumes.
 *
 * Deliberately NOT imported from `@dl/shared/fixtures` (same algorithm as that
 * module's `weekStartsFor`): the real pipeline shouldn't depend on the fixture
 * generator package for its own dates, and `shared/src/fixtures/**` is off
 * limits to edit. Kept unit-tested against that module's output so the two
 * copies can't silently drift apart.
 */
import { WEEKS_OF_HISTORY } from '@dl/shared';

export function weekStartsFor(now: Date): string[] {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // 0 = Monday
  const lastMonday = day.getTime() - dow * 86_400_000;
  const out: string[] = [];
  for (let i = WEEKS_OF_HISTORY - 1; i >= 0; i--) {
    out.push(new Date(lastMonday - i * 7 * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}
