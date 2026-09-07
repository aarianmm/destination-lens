/**
 * Search matching is the one piece of the search feature with real edge cases —
 * accents, case, tier precedence and the misspelling tolerance that must stay
 * tight enough not to flood the list with near-misses. The overlay around it is
 * plain rendering and is not tested here.
 */
import { describe, expect, it } from 'vitest';
import { normalise, scoreName } from '../src/search/match.js';

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
