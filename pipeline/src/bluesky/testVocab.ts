/**
 * AGENT E's own local stand-in for Agent D's `shared/vocab/TH.json`, which was
 * still being written when this module needed a vocab to develop and
 * live-test the collector/prefilter against. Conforms to `vocabSchema`. Not a
 * dependency of the app or pipeline wiring — delete once the real
 * `shared/vocab/**` files have landed on `main` and been merged in.
 *
 * `koh-lanta`'s `negativeKeywords` aren't guesswork: a live search during
 * development turned up a real, severe collision with "Koh-Lanta", the French
 * reality-TV show (TF1) — see the notes at the top of `bluesky/index.ts`.
 */
import { vocabSchema, type Vocab } from '@dl/shared';

export const TEST_VOCAB_TH: Vocab = vocabSchema.parse({
  iso2: 'TH',
  name: 'Thailand',
  aliases: ['Siam'],
  centroid: { lat: 13.0, lng: 101.0 },
  bounds: { north: 20.5, south: 5.6, east: 105.7, west: 97.3 },
  destinations: [
    {
      slug: 'phuket',
      name: 'Phuket',
      aliases: [],
      lat: 7.8804,
      lng: 98.3923,
      wikipediaTitle: 'Phuket province',
      requireContext: false,
      negativeKeywords: [],
    },
    {
      slug: 'chiang-mai',
      name: 'Chiang Mai',
      aliases: [],
      lat: 18.7883,
      lng: 98.9853,
      wikipediaTitle: 'Chiang Mai',
      requireContext: false,
      negativeKeywords: [],
    },
    {
      slug: 'koh-lanta',
      name: 'Koh Lanta',
      aliases: ['Ko Lanta'],
      lat: 7.62,
      lng: 99.04,
      wikipediaTitle: 'Ko Lanta',
      // Verified live: unguarded, the large majority of raw hits for "Koh
      // Lanta" are about the French reality show, not the island.
      requireContext: true,
      negativeKeywords: [
        'denis brogniart',
        'brogniart',
        'tf1',
        'koh-lanta all stars',
        'aventurier',
        'aventuriers',
        'immunité',
        'épreuve',
        'poteau',
      ],
    },
  ],
});
