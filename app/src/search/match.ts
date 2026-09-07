/**
 * Search matching — pure, so it can be reasoned about and tested without a DOM.
 *
 * Ranking is deliberately tiered rather than a single fuzzy score: a typed
 * prefix is almost always the intended place, and letting an edit-distance
 * score outrank it is how search boxes end up feeling arbitrary.
 */

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
export type MatchTier = 'prefix' | 'word' | 'substring';

export type NameScore = { tier: MatchTier; distance: number };

export function scoreName(query: string, name: string): NameScore | null {
  const q = normalise(query);
  const n = normalise(name);
  if (q === '') return null;

  if (n.startsWith(q)) return { tier: 'prefix', distance: 0 };
  if (n.split(' ').some((word) => word.startsWith(q))) return { tier: 'word', distance: 0 };
  if (n.includes(q)) return { tier: 'substring', distance: 0 };
  return null;
}
