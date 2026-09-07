/**
 * The index builder's job is to survive a partial data set: snapshots are
 * published by a batch job, and a country file that 404s must cost that one
 * country's destinations, not the whole search feature.
 */
import { describe, expect, it } from 'vitest';
import { buildSearchIndex } from '../src/search/searchIndex.js';

const WORLD = {
  countries: [
    { iso2: 'TH', name: 'Thailand', covered: true },
    { iso2: 'VN', name: 'Vietnam', covered: true },
    { iso2: 'TZ', name: 'Tanzania', covered: false },
  ],
};

function countryFile(iso2: string, name: string, destination: string) {
  return {
    iso2,
    name,
    destinations: [
      {
        slug: destination.toLowerCase(),
        name: destination,
        lat: 1,
        lng: 2,
        status: 'emerging' as const,
        growthPct: 30,
      },
    ],
  };
}

describe('buildSearchIndex', () => {
  it('combines world countries with the destinations of covered countries', async () => {
    const index = await buildSearchIndex({
      loadWorld: async () => WORLD,
      loadMeta: async () => ({ countries: ['TH', 'VN'] }),
      loadCountry: async (iso2) =>
        iso2 === 'TH' ? countryFile('TH', 'Thailand', 'Bangkok') : countryFile('VN', 'Vietnam', 'Hoi An'),
    });

    expect(index.countries).toHaveLength(3);
    expect(index.destinations.map((d) => d.name).sort()).toEqual(['Bangkok', 'Hoi An']);
    expect(index.destinations.find((d) => d.name === 'Bangkok')?.countryName).toBe('Thailand');
  });

  it('only fetches the countries meta says are covered', async () => {
    const asked: string[] = [];
    await buildSearchIndex({
      loadWorld: async () => WORLD,
      loadMeta: async () => ({ countries: ['TH'] }),
      loadCountry: async (iso2) => {
        asked.push(iso2);
        return countryFile('TH', 'Thailand', 'Bangkok');
      },
    });

    expect(asked).toEqual(['TH']);
  });

  it('drops a country whose snapshot fails and keeps the rest searchable', async () => {
    const index = await buildSearchIndex({
      loadWorld: async () => WORLD,
      loadMeta: async () => ({ countries: ['TH', 'VN'] }),
      loadCountry: async (iso2) => {
        if (iso2 === 'TH') throw new Error('404');
        return countryFile('VN', 'Vietnam', 'Hoi An');
      },
    });

    expect(index.countries).toHaveLength(3);
    expect(index.destinations.map((d) => d.name)).toEqual(['Hoi An']);
  });

  it('still fails when the world snapshot itself is unavailable', async () => {
    // Without world.json there is nothing to search, so this must surface as an
    // error the overlay can report rather than an empty result list.
    await expect(
      buildSearchIndex({
        loadWorld: async () => {
          throw new Error('offline');
        },
        loadMeta: async () => ({ countries: [] }),
        loadCountry: async () => countryFile('TH', 'Thailand', 'Bangkok'),
      }),
    ).rejects.toThrow('offline');
  });
});
