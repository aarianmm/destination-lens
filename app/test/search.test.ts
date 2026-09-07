/**
 * Search matching is the one piece of the search feature with real edge cases —
 * accents, case, tier precedence and the misspelling tolerance that must stay
 * tight enough not to flood the list with near-misses. The overlay around it is
 * plain rendering and is not tested here.
 */
import { describe, expect, it } from 'vitest';
import { normalise, scoreName, search, type SearchIndex } from '../src/search/match.js';

describe('normalise', () => {
  it('lowercases and strips accents so "malaga" reaches "Málaga"', () => {
    expect(normalise('Málaga')).toBe('malaga');
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(normalise('  Koh   Lanta ')).toBe('koh lanta');
  });
});

describe('scoreName tiers', () => {
  it('ranks a whole-name prefix above a word prefix', () => {
    const whole = scoreName('koh', 'Koh Lanta');
    const word = scoreName('lanta', 'Koh Lanta');
    expect(whole).not.toBeNull();
    expect(word).not.toBeNull();
    expect(whole!.tier).toBe('prefix');
    expect(word!.tier).toBe('word');
  });

  it('falls back to a substring match inside a word', () => {
    expect(scoreName('kyo', 'Tokyo')?.tier).toBe('substring');
  });

  it('returns null when nothing matches', () => {
    expect(scoreName('zzz', 'Tokyo')).toBeNull();
  });

  it('ignores case and accents on both sides', () => {
    expect(scoreName('MALAGA', 'Málaga')?.tier).toBe('prefix');
  });
});

describe('scoreName misspelling tolerance', () => {
  it('accepts a single wrong letter in a full name', () => {
    const hit = scoreName('bangkock', 'Bangkok');
    expect(hit?.tier).toBe('fuzzy');
    expect(hit?.distance).toBe(1);
  });

  it('accepts a misspelling in a partial name, so "bengk" reaches Bangkok', () => {
    // Prefix-tolerant: the name may run past the query for free, otherwise a
    // typo early in a long name is unreachable until the whole word is typed.
    expect(scoreName('bengk', 'Bangkok')?.tier).toBe('fuzzy');
  });

  it('tolerates a transposition', () => {
    expect(scoreName('tokoy', 'Tokyo')?.tier).toBe('fuzzy');
  });

  it('refuses to guess for queries under four characters', () => {
    // "san" one edit from "sun"/"sao"/"san…" would flood the list.
    expect(scoreName('san', 'Sun City')).toBeNull();
  });

  it('allows only one edit up to six characters', () => {
    expect(scoreName('lisbin', 'Lisbon')?.distance).toBe(1);
    expect(scoreName('lasbin', 'Lisbon')).toBeNull();
  });

  it('allows two edits from seven characters up', () => {
    expect(scoreName('marrakch', 'Marrakesh')?.distance).toBe(2);
  });

  it('still rejects a genuinely different name', () => {
    expect(scoreName('reykjavik', 'Bangkok')).toBeNull();
  });

  it('matches a misspelled second word', () => {
    expect(scoreName('lantar', 'Koh Lanta')?.tier).toBe('fuzzy');
  });
});

const INDEX: SearchIndex = {
  countries: [
    { iso2: 'TH', name: 'Thailand', covered: true },
    { iso2: 'VN', name: 'Vietnam', covered: true },
    { iso2: 'TZ', name: 'Tanzania', covered: false },
  ],
  destinations: [
    dest('koh-lanta', 'Koh Lanta', 'TH', 'Thailand'),
    dest('koh-tao', 'Koh Tao', 'TH', 'Thailand'),
    dest('bangkok', 'Bangkok', 'TH', 'Thailand'),
    dest('hoi-an', 'Hoi An', 'VN', 'Vietnam'),
  ],
};

function dest(slug: string, name: string, countryIso2: string, countryName: string) {
  return {
    slug,
    name,
    countryIso2,
    countryName,
    lat: 0,
    lng: 0,
    status: 'emerging' as const,
    growthPct: 10,
  };
}

describe('search', () => {
  it('returns nothing for a blank query rather than the whole index', () => {
    expect(search(INDEX, '   ')).toEqual({ countries: [], destinations: [] });
  });

  it('finds a country by exact iso2 code', () => {
    expect(search(INDEX, 'th').countries.map((c) => c.iso2)).toEqual(['TH']);
  });

  it('groups countries and destinations separately', () => {
    const hits = search(INDEX, 'thailand');
    expect(hits.countries.map((c) => c.iso2)).toEqual(['TH']);
    // Destinations do not match on their country's name -- that is what the
    // country result itself is for.
    expect(hits.destinations).toEqual([]);
  });

  it('orders exact matches ahead of misspelled ones', () => {
    const names = search(INDEX, 'bangkok').destinations.map((d) => d.name);
    expect(names[0]).toBe('Bangkok');
  });

  it('breaks ties within a tier by the shorter name', () => {
    expect(search(INDEX, 'koh').destinations.map((d) => d.name)).toEqual(['Koh Tao', 'Koh Lanta']);
  });

  it('keeps uncovered countries findable, flagged by their own data', () => {
    const hit = search(INDEX, 'tanzania').countries[0];
    expect(hit?.iso2).toBe('TZ');
    expect(hit?.covered).toBe(false);
  });

  it('caps each group', () => {
    const hits = search(INDEX, 'koh', { countries: 1, destinations: 1 });
    expect(hits.destinations).toHaveLength(1);
  });
});

describe('scoreName fuzzy anchoring', () => {
  it('does not let a fuzzy match start in the middle of a name', () => {
    // "thail" reaches the "thai" inside "Sukhothai" only if the match is
    // allowed to skip a prefix for free. It must anchor at the start, or
    // typing a country name dredges up unrelated destinations.
    expect(scoreName('thail', 'Sukhothai')).toBeNull();
  });

  it('anchors per word, so a later word is still reachable', () => {
    expect(scoreName('lantar', 'Koh Lanta')?.tier).toBe('fuzzy');
  });

  it('still lets the name run past the query', () => {
    expect(scoreName('bengk', 'Bangkok')?.tier).toBe('fuzzy');
  });
});
