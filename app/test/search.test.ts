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
