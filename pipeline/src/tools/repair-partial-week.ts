/**
 * ONE-OFF REPAIR. Not part of the pipeline; safe to delete once superseded by a
 * clean run.
 *
 * The snapshots in `data/` were produced by a run whose 26-week series ended on
 * the *in-progress* week. That week was minutes old, so it contributed ~0 to the
 * four-week "recent" average and pushed roughly -20 to -25 points of phantom
 * decline onto every destination (Bangkok -22.7%, Tokyo -22.5%). The window bug
 * itself is fixed in `pipeline/src/lib/weeks.ts`, but re-collecting would cost
 * another full API run, so this recomputes the affected numbers arithmetically
 * from data already on disk.
 *
 * What it does: recomputes growth, z-score, status and interest percentile using
 * only the 25 COMPLETE weeks, then re-ranks `world.emerging`.
 *
 * What it deliberately does NOT do: touch `weeklyMentions`. Those counts are
 * real, including the partial final week. Rewriting them to look tidier would be
 * inventing data. The final point in a sparkline from this snapshot is a partial
 * week and genuinely does dip.
 *
 * The slicing is reimplemented here rather than reusing `classify()`, which
 * requires exactly 26 weeks. Thresholds and clamps are imported so the two
 * cannot drift on the numbers that matter.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { countrySchema, destinationSchema, worldSchema, type DestinationStatus } from '@dl/shared';
import { DEFAULT_THRESHOLDS, MAX_GROWTH_PCT, MIN_GROWTH_PCT } from '../trends/index.js';
import { DATA_DIR } from '../lib/paths.js';

const RECENT_WEEKS = 4;
const ESTABLISHED_PERCENTILE = 75;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdDev = (xs: number[], avg: number) => Math.sqrt(mean(xs.map((x) => (x - avg) ** 2)));
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Same rules as `classify`, applied to the complete weeks only. */
function reclassify(weekly: number[]) {
  const complete = weekly.slice(0, -1); // drop the in-progress week
  const baselineWeeks = complete.slice(0, complete.length - RECENT_WEEKS);
  const recentWeeks = complete.slice(complete.length - RECENT_WEEKS);
  const baseline = mean(baselineWeeks);
  const recent = mean(recentWeeks);
  const sigma = stdDev(baselineWeeks, baseline);

  const growthRatio = (recent - baseline) / Math.max(baseline, 0.5);
  const growthPct = round(Math.max(MIN_GROWTH_PCT, Math.min(MAX_GROWTH_PCT, growthRatio * 100)));
  const zScore = round((recent - baseline) / Math.max(sigma, 0.5), 2);

  const t = DEFAULT_THRESHOLDS;
  let status: DestinationStatus = 'quiet';
  if (baseline < 1 && recent >= t.minRecentWeekly) status = 'new';
  else if (growthRatio > t.emergingGrowth && zScore > t.emergingZ && recent >= t.minRecentWeekly)
    status = 'emerging';
  else if (growthRatio < t.decliningGrowth && baseline >= t.minBaselineForDecline)
    status = 'declining';

  return { status, growthPct, zScore, recent };
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v), 'utf8');

const countryDir = join(DATA_DIR, 'country');
const destDir = join(DATA_DIR, 'destination');

const recomputed = new Map<string, ReturnType<typeof reclassify> & { interestScore: number }>();

for (const file of readdirSync(countryDir)) {
  const country = countrySchema.parse(read(join(countryDir, file)));
  const rows = country.destinations.map((d) => ({ d, r: reclassify(d.weeklyMentions) }));

  // interestScore is a within-country percentile of recent volume.
  const sorted = [...rows].sort((a, b) => a.r.recent - b.r.recent);
  const scores = new Map(
    sorted.map((row, i) => [
      row.d.slug,
      rows.length === 1 ? 100 : Math.round((i / (rows.length - 1)) * 100),
    ]),
  );

  country.destinations = rows.map(({ d, r }) => {
    const interestScore = scores.get(d.slug)!;
    // Steady, high-volume places are 'established' rather than 'quiet'.
    const status =
      r.status === 'quiet' && interestScore >= ESTABLISHED_PERCENTILE ? 'established' : r.status;
    recomputed.set(d.slug, { ...r, status, interestScore });
    return { ...d, status, growthPct: r.growthPct, interestScore };
  });

  write(join(countryDir, file), countrySchema.parse(country));
}

for (const file of readdirSync(destDir)) {
  const dest = destinationSchema.parse(read(join(destDir, file)));
  const r = recomputed.get(dest.slug);
  if (!r) continue;
  write(
    join(destDir, file),
    destinationSchema.parse({
      ...dest,
      status: r.status,
      growthPct: r.growthPct,
      interestScore: r.interestScore,
    }),
  );
}

// Re-rank the global emerging feed: movement weighted by volume, never raw growth%.
const worldPath = join(DATA_DIR, 'world.json');
const world = worldSchema.parse(read(worldPath));
world.emerging = world.emerging
  .flatMap((e) => {
    const r = recomputed.get(e.slug);
    if (!r || (r.status !== 'emerging' && r.status !== 'new')) return [];
    return [{ ...e, status: r.status, growthPct: r.growthPct, score: r.zScore * Math.log10(r.recent + 10) }];
  })
  .sort((a, b) => b.score - a.score)
  .map(({ score: _score, ...e }, i) => ({ ...e, rank: i + 1 }));
write(worldPath, worldSchema.parse(world));

console.log(`repaired ${recomputed.size} destinations; ${world.emerging.length} emerging entries`);
