import { describe, expect, it } from 'vitest';
import { vocabDestinationSchema, type VocabDestination } from '@dl/shared';
import { countQueryFor, prefilter } from '../src/bluesky/index.js';

function dest(
  overrides: Partial<VocabDestination> & { slug: string; name: string },
): VocabDestination {
  return vocabDestinationSchema.parse({
    lat: 0,
    lng: 0,
    wikipediaTitle: overrides.name,
    aliases: [],
    requireContext: false,
    negativeKeywords: [],
    ...overrides,
  });
}

const NICE = dest({
  slug: 'nice',
  name: 'Nice',
  requireContext: true,
});

const SPLIT = dest({
  slug: 'split',
  name: 'Split',
  requireContext: true,
});

const JAVA = dest({
  slug: 'java',
  name: 'Java',
  requireContext: true,
  negativeKeywords: ['javascript', 'spring boot', 'jvm'],
});

const PHUKET = dest({ slug: 'phuket', name: 'Phuket' });

const KOH_LANTA = dest({
  slug: 'koh-lanta',
  name: 'Koh Lanta',
  aliases: ['Ko Lanta'],
  requireContext: true,
  negativeKeywords: ['denis brogniart', 'tf1', 'koh-lanta all stars', 'immunité'],
});

const CASINO_TOWN = dest({
  slug: 'casino-town',
  name: 'Casino Town',
  negativeKeywords: ['jackpot', 'slot machine'],
});

describe('prefilter — homonym false positives', () => {
  it('rejects "Nice try" without travel context', () => {
    expect(prefilter({ text: 'Nice try, but no.' }, NICE, 'France')).toBe(false);
  });

  it('rejects "let\'s split the bill" without travel context', () => {
    expect(prefilter({ text: "Let's split the bill evenly, ok?" }, SPLIT, 'Croatia')).toBe(false);
  });

  it('rejects "Java the language" without travel context', () => {
    expect(
      prefilter(
        { text: 'Learning Java the language this year, starting with generics.' },
        JAVA,
        'Indonesia',
      ),
    ).toBe(false);
  });

  it('rejects Java posts about programming via requireContext, even without a matching negative keyword', () => {
    expect(
      prefilter(
        { text: 'Just shipped a Java microservice today, code review went smoothly.' },
        JAVA,
        'Indonesia',
      ),
    ).toBe(false);
  });
});

describe('prefilter — negative keywords', () => {
  it('rejects a post matching a destination negative keyword regardless of other content', () => {
    expect(
      prefilter(
        {
          text: 'Casino Town holiday! Hit the jackpot on the slot machine last night, best trip ever.',
        },
        CASINO_TOWN,
        'Nowhereland',
      ),
    ).toBe(false);
  });

  it('rejects the real "Koh Lanta" collision with the French TV show', () => {
    expect(
      prefilter(
        {
          text: "Ce soir dans Koh-Lanta, l'épreuve d'immunité s'annonce terrible pour les aventuriers !",
        },
        KOH_LANTA,
        'Thailand',
      ),
    ).toBe(false);
    expect(
      prefilter(
        { text: 'Denis Brogniart announces Koh-Lanta All Stars will return on TF1 this year.' },
        KOH_LANTA,
        'Thailand',
      ),
    ).toBe(false);
  });
});

describe('prefilter — obvious junk', () => {
  it('rejects crypto/spam', () => {
    expect(
      prefilter(
        { text: 'Phuket coin airdrop live now! Join the whitelist mint before it closes 🚀' },
        PHUKET,
        'Thailand',
      ),
    ).toBe(false);
  });

  it('rejects ticket touts even when the post is nominally travel-related', () => {
    expect(
      prefilter(
        { text: 'Flight tickets to Phuket for sale, DM me for tickets, cheap price guaranteed!' },
        PHUKET,
        'Thailand',
      ),
    ).toBe(false);
  });

  it('rejects bot/follow-spam posts', () => {
    expect(
      prefilter(
        { text: 'Loved my Phuket trip! Follow me back for more, link in bio 🔗' },
        PHUKET,
        'Thailand',
      ),
    ).toBe(false);
  });

  it('rejects a sports-team-style homonym collision via requireContext', () => {
    const barcelona = dest({ slug: 'barcelona', name: 'Barcelona', requireContext: true });
    expect(
      prefilter(
        { text: 'Barcelona 3-0 last night, best performance of the season.' },
        barcelona,
        'Spain',
      ),
    ).toBe(false);
  });
});

describe('prefilter — genuine travel posts survive', () => {
  it('keeps a plain mention with no requireContext', () => {
    expect(
      prefilter({ text: 'Just landed in Phuket, the beaches are unreal.' }, PHUKET, 'Thailand'),
    ).toBe(true);
  });

  it('keeps a requireContext destination when the country name co-occurs', () => {
    expect(
      prefilter(
        { text: 'Spent a week in Split, Croatia — old town was gorgeous.' },
        SPLIT,
        'Croatia',
      ),
    ).toBe(true);
  });

  it('keeps a requireContext destination when a travel keyword co-occurs', () => {
    expect(
      prefilter({ text: 'Booked a hotel in Nice for our honeymoon next spring.' }, NICE, 'France'),
    ).toBe(true);
  });

  it('keeps a genuine Koh Lanta travel post with real travel context', () => {
    expect(
      prefilter(
        { text: 'Koh Lanta was so much quieter than Phuket, best beaches of the whole trip.' },
        KOH_LANTA,
        'Thailand',
      ),
    ).toBe(true);
  });

  it('matches on an alias, not just the primary name', () => {
    expect(
      prefilter(
        { text: 'Ko Lanta beaches were empty in October, perfect for a quiet holiday.' },
        KOH_LANTA,
        'Thailand',
      ),
    ).toBe(true);
  });

  it('rejects posts that do not mention the destination at all', () => {
    expect(
      prefilter({ text: 'Just a normal day, nothing travel related here.' }, PHUKET, 'Thailand'),
    ).toBe(false);
  });
});

describe('travel context is required for every destination', () => {
  // Live sampling showed ordinary city names are dominated by residents talking
  // about football, politics and daily life. Requiring travel context only for
  // flagged homonyms let all of that through as "traveller interest".
  const barcelona = {
    slug: 'barcelona',
    name: 'Barcelona',
    aliases: [],
    lat: 41.3874,
    lng: 2.1686,
    wikipediaTitle: 'Barcelona',
    requireContext: false,
    negativeKeywords: [],
  };

  it('drops a bare mention with no travel context, even when unflagged', () => {
    expect(prefilter({ text: 'Barcelona 5-0, what a result' }, barcelona, 'Spain')).toBe(false);
  });

  it('keeps a genuine travel post about the same unflagged destination', () => {
    expect(
      prefilter(
        { text: 'Five days in Barcelona next month, any restaurant tips?' },
        barcelona,
        'Spain',
      ),
    ).toBe(true);
  });
});

// Task 3 (Agent G, Wave 2): the weekly mention COUNT (hitsTotal) has no local
// prefilter to run — it's a single number from the API, not a list of posts —
// so the only lever is the query text itself. This just pins the query shape;
// the actual filtering effect was verified live against the real API (see the
// block comment in bluesky/index.ts and the PR description for the transcript:
// `"Koh Lanta"` alone = 364 hitsTotal, mostly a French reality-TV show;
// `"Koh Lanta" travel` = 12).
describe('countQueryFor — travel-context AND for weekly counts', () => {
  it('ANDs a travel-context term onto a single-word destination name', () => {
    expect(countQueryFor('Bangkok')).toBe('Bangkok travel');
  });

  it('ANDs a travel-context term onto a quoted multi-word destination name', () => {
    expect(countQueryFor('Koh Lanta')).toBe('"Koh Lanta" travel');
  });
});
