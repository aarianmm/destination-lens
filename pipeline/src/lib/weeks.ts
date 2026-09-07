/**
 * Monday-aligned week boundaries for the trailing `WEEKS_OF_HISTORY` COMPLETE
 * weeks, oldest first.
 *
 * The series deliberately ends at the last *finished* week, not the one in
 * progress. Including the current week meant every run averaged a partial week
 * into "recent": a run early on a Monday saw a week only minutes old, and the
 * first real pipeline run consequently reported roughly -20 to -25 points of
 * growth across nearly every destination — Bangkok -22.7%, Tokyo -22.5% — none
 * of which was a real decline. It also put a cliff on the right edge of every
 * sparkline. The bias shrinks later in the week but never disappears, so the
 * partial week is excluded outright.
 */
import { WEEKS_OF_HISTORY } from '@dl/shared';

export function weekStartsFor(now: Date): string[] {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // 0 = Monday
  const thisMonday = day.getTime() - dow * 86_400_000;
  // Step back one week: `thisMonday` starts the in-progress week.
  const lastCompleteMonday = thisMonday - 7 * 86_400_000;
  const out: string[] = [];
  for (let i = WEEKS_OF_HISTORY - 1; i >= 0; i--) {
    out.push(new Date(lastCompleteMonday - i * 7 * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}
