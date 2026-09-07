/**
 * Search matching — pure, so it can be reasoned about and tested without a DOM.
 *
 * Ranking is deliberately tiered rather than a single fuzzy score: a typed
 * prefix is almost always the intended place, and letting an edit-distance
 * score outrank it is how search boxes end up feeling arbitrary.
 */
import type { DestinationStatus } from '@dl/shared';

/** Lowercase, strip accents, collapse whitespace — applied to query and name alike. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritics left behind by NFD
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Best (lowest) tier wins; `distance` only varies within the fuzzy tier. */
export type MatchTier = 'prefix' | 'word' | 'substring' | 'fuzzy';

export type NameScore = { tier: MatchTier; distance: number };

export function scoreName(query: string, name: string): NameScore | null {
  const q = normalise(query);
  const n = normalise(name);
  if (q === '') return null;

  if (n.startsWith(q)) return { tier: 'prefix', distance: 0 };
  if (n.split(' ').some((word) => word.startsWith(q))) return { tier: 'word', distance: 0 };
  if (n.includes(q)) return { tier: 'substring', distance: 0 };

  // Only now, having failed every exact reading, guess at a misspelling --
  // against the whole name and against each word, since the typo may be in
  // the second one ("koh lantar").
  const budget = maxEdits(q.length);
  if (budget === 0) return null;
  let best: number | null = prefixDistance(q, n, budget);
  for (const word of n.split(' ')) {
    const d = prefixDistance(q, word, best === null ? budget : Math.min(budget, best));
    if (d !== null && (best === null || d < best)) best = d;
  }
  return best === null ? null : { tier: 'fuzzy', distance: best };
}

/**
 * Edits tolerated for a query of this length. Short queries get none: at three
 * characters almost every name in the index is one edit away, and a list of
 * plausible-looking wrong answers is worse than a short list of right ones.
 */
function maxEdits(queryLength: number): number {
  if (queryLength < 4) return 0;
  if (queryLength <= 6) return 1;
  return 2;
}

/**
 * Damerau-Levenshtein distance from `q` to the closest PREFIX of `n`, or null
 * once it is certain to exceed `max`.
 *
 * Prefix-tolerant because the query is usually half-typed: row 0 costs nothing
 * at any column, so `n` may run past `q` for free and "bengk" still reaches
 * "Bangkok". Transpositions cost one edit rather than two -- swapped letters
 * are the typo people actually make.
 */
function prefixDistance(q: string, n: string, max: number): number | null {
  const cols = n.length + 1;
  // Three rows: the transposition rule looks two rows back. Every cell is
  // written before anything reads it, so the `!` reads are always in range.
  let beforePrev = new Int32Array(cols);
  let prev = new Int32Array(cols); // row 0: an empty query matches any prefix free
  let curr = new Int32Array(cols);

  for (let i = 1; i <= q.length; i++) {
    curr[0] = i;
    let rowMin = i;
    let diag = prev[0]!; // prev[j - 1], carried rather than re-read
    let left = i; // curr[j - 1]
    for (let j = 1; j < cols; j++) {
      const up = prev[j]!;
      const substitution = q[i - 1] === n[j - 1] ? 0 : 1;
      let best = Math.min(
        up + 1, // drop a character of the query
        left + 1, // skip a character of the name
        diag + substitution,
      );
      if (i > 1 && j > 1 && q[i - 1] === n[j - 2] && q[i - 2] === n[j - 1]) {
        best = Math.min(best, beforePrev[j - 2]! + 1);
      }
      curr[j] = best;
      if (best < rowMin) rowMin = best;
      diag = up;
      left = best;
    }
    // Row minima never decrease, so once a whole row is out of budget no later
    // row can bring it back under.
    if (rowMin > max) return null;
    [beforePrev, prev, curr] = [prev, curr, beforePrev];
  }

  let best = prev[0]!;
  for (let j = 1; j < cols; j++) {
    const cell = prev[j]!;
    if (cell < best) best = cell;
  }
  return best <= max ? best : null;
}

// ---------------------------------------------------------------------------
// Ranking the index
// ---------------------------------------------------------------------------

export type CountryItem = { iso2: string; name: string; covered: boolean };

export type DestinationItem = {
  slug: string;
  name: string;
  countryIso2: string;
  countryName: string;
  lat: number;
  lng: number;
  status: DestinationStatus;
  growthPct: number;
};

export type SearchIndex = { countries: CountryItem[]; destinations: DestinationItem[] };
export type SearchLimits = { countries: number; destinations: number };

/** Enough to be useful, short enough to scan without scrolling far. */
export const DEFAULT_LIMITS: SearchLimits = { countries: 8, destinations: 12 };

const TIER_RANK: Record<MatchTier, number> = { prefix: 0, word: 1, substring: 2, fuzzy: 3 };

function rankByName<T extends { name: string }>(
  items: T[],
  query: string,
  limit: number,
  score: (item: T, query: string) => NameScore | null,
): T[] {
  const hits: { item: T; tier: number; distance: number }[] = [];
  for (const item of items) {
    const s = score(item, query);
    if (s) hits.push({ item, tier: TIER_RANK[s.tier], distance: s.distance });
  }
  hits.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.distance - b.distance ||
      // A shorter name containing the same match is the more specific answer:
      // "Koh Tao" before "Koh Lanta" for "koh".
      a.item.name.length - b.item.name.length ||
      a.item.name.localeCompare(b.item.name),
  );
  return hits.slice(0, limit).map((h) => h.item);
}

/**
 * Rank the index against a query, grouped for display.
 *
 * Destinations deliberately do NOT match on their country's name: typing
 * "thailand" should surface Thailand, whose own screen is where its
 * destinations belong, rather than flooding the list with fifteen of them.
 */
export function search(
  index: SearchIndex,
  query: string,
  limits: SearchLimits = DEFAULT_LIMITS,
): { countries: CountryItem[]; destinations: DestinationItem[] } {
  const q = normalise(query);
  if (q === '') return { countries: [], destinations: [] };

  return {
    countries: rankByName(index.countries, q, limits.countries, (c) =>
      // "ZA" should find South Africa, which its name alone never would.
      c.iso2.toLowerCase() === q ? { tier: 'prefix', distance: 0 } : scoreName(q, c.name),
    ),
    destinations: rankByName(index.destinations, q, limits.destinations, (d) =>
      scoreName(q, d.name),
    ),
  };
}
