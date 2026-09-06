/**
 * Sharp, edge-case-only tests for the flights aggregation. buildFlows() itself hits the
 * network (OpenFlights download) and is exercised manually via `npm run flights`; these
 * tests cover the pure logic that actually breaks: country-name mapping misses, domestic
 * exclusion, weight normalisation edge cases, and cap-after-ranking.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateCountryRoutes,
  buildInboundForCountry,
  computeCountryCentroids,
  rankAndNormalize,
  type CountryPair,
} from '../src/flights/aggregate.js';
import { mapCountryNameToIso2 } from '../src/flights/countryCodes.js';
import type { Airport, Route } from '../src/flights/parse.js';
import { parseAirports, parseRoutes } from '../src/flights/parse.js';

function airport(id: number, country: string, lat = 0, lng = 0): Airport {
  return { id, name: `Airport ${id}`, city: 'City', country, iata: 'XXX', lat, lng };
}

describe('country name -> iso2 mapping', () => {
  it('maps well-known names', () => {
    expect(mapCountryNameToIso2('Thailand')).toBe('TH');
    expect(mapCountryNameToIso2('United Kingdom')).toBe('GB');
  });

  it('maps both dataset variants of Myanmar/Burma to the same iso2', () => {
    expect(mapCountryNameToIso2('Burma')).toBe('MM');
    expect(mapCountryNameToIso2('Myanmar')).toBe('MM');
  });

  it('returns undefined for a genuinely unknown name rather than guessing', () => {
    expect(mapCountryNameToIso2('Neverland')).toBeUndefined();
    expect(mapCountryNameToIso2('Netherlands Antilles')).toBeUndefined();
  });
});

describe('aggregateCountryRoutes', () => {
  it('drops domestic routes (from === to)', () => {
    const airports = [airport(1, 'Thailand'), airport(2, 'Thailand'), airport(3, 'Japan')];
    const routes: Route[] = [
      { sourceAirportId: 1, destAirportId: 2 }, // domestic TH -> TH
      { sourceAirportId: 1, destAirportId: 3 }, // TH -> JP
    ];
    const { pairs } = aggregateCountryRoutes(airports, routes);
    expect(pairs).toEqual([{ fromIso2: 'TH', toIso2: 'JP', count: 1 }]);
  });

  it('reports unmapped country names instead of silently dropping them', () => {
    const airports = [airport(1, 'Thailand'), airport(2, 'Wakanda')];
    const routes: Route[] = [{ sourceAirportId: 1, destAirportId: 2 }];
    const { pairs, unmapped } = aggregateCountryRoutes(airports, routes);
    // the route can't be attributed on both ends, so it contributes to no country pair
    expect(pairs).toEqual([]);
    expect(unmapped.get('Wakanda')).toBe(1);
  });

  it('ignores routes referencing an airport id that does not exist', () => {
    const airports = [airport(1, 'Thailand')];
    const routes: Route[] = [{ sourceAirportId: 1, destAirportId: 999 }];
    const { pairs } = aggregateCountryRoutes(airports, routes);
    expect(pairs).toEqual([]);
  });

  it('accumulates counts across multiple routes between the same country pair', () => {
    const airports = [
      airport(1, 'Thailand'),
      airport(2, 'Thailand'),
      airport(3, 'Japan'),
      airport(4, 'Japan'),
    ];
    const routes: Route[] = [
      { sourceAirportId: 1, destAirportId: 3 },
      { sourceAirportId: 2, destAirportId: 4 },
      { sourceAirportId: 1, destAirportId: 4 },
    ];
    const { pairs } = aggregateCountryRoutes(airports, routes);
    expect(pairs).toEqual([{ fromIso2: 'TH', toIso2: 'JP', count: 3 }]);
  });
});

describe('rankAndNormalize', () => {
  it('normalises a single route to weight 1', () => {
    const pairs: CountryPair[] = [{ fromIso2: 'TH', toIso2: 'JP', count: 7 }];
    const flows = rankAndNormalize(pairs, 200);
    expect(flows).toEqual([{ fromIso2: 'TH', toIso2: 'JP', weight: 1 }]);
  });

  it('gives all-equal-count pairs a weight of 1, not an average', () => {
    const pairs: CountryPair[] = [
      { fromIso2: 'TH', toIso2: 'JP', count: 5 },
      { fromIso2: 'JP', toIso2: 'TH', count: 5 },
      { fromIso2: 'ES', toIso2: 'GB', count: 5 },
    ];
    const flows = rankAndNormalize(pairs, 200);
    expect(flows.every((f) => f.weight === 1)).toBe(true);
  });

  it('normalises proportionally against the largest count', () => {
    const pairs: CountryPair[] = [
      { fromIso2: 'A', toIso2: 'B', count: 10 },
      { fromIso2: 'C', toIso2: 'D', count: 5 },
      { fromIso2: 'E', toIso2: 'F', count: 1 },
    ];
    const flows = rankAndNormalize(pairs, 200);
    expect(flows.map((f) => f.weight)).toEqual([1, 0.5, 0.1]);
  });

  it('applies the cap AFTER ranking, keeping the biggest routes rather than the first N seen', () => {
    // Deliberately insertion-ordered so the smallest count comes first.
    const pairs: CountryPair[] = [
      { fromIso2: 'A', toIso2: 'B', count: 1 },
      { fromIso2: 'C', toIso2: 'D', count: 100 },
      { fromIso2: 'E', toIso2: 'F', count: 50 },
    ];
    const flows = rankAndNormalize(pairs, 2);
    expect(flows).toHaveLength(2);
    expect(flows.map((f) => `${f.fromIso2}${f.toIso2}`)).toEqual(['CD', 'EF']);
  });

  it('returns an empty list, not NaN weights, for an empty input', () => {
    expect(rankAndNormalize([], 200)).toEqual([]);
  });
});

describe('buildInboundForCountry', () => {
  const names = new Map([
    ['GB', 'United Kingdom'],
    ['DE', 'Germany'],
    ['FR', 'France'],
  ]);

  it('only includes routes landing in the target country, normalised against its own max', () => {
    const pairs: CountryPair[] = [
      { fromIso2: 'GB', toIso2: 'ES', count: 20 }, // wrong destination, must be excluded
      { fromIso2: 'GB', toIso2: 'TH', count: 8 },
      { fromIso2: 'DE', toIso2: 'TH', count: 4 },
    ];
    const inbound = buildInboundForCountry(pairs, 'TH', 15, names);
    expect(inbound).toEqual([
      { fromIso2: 'GB', fromName: 'United Kingdom', weight: 1 },
      { fromIso2: 'DE', fromName: 'Germany', weight: 0.5 },
    ]);
  });

  it('caps to topN after ranking', () => {
    const pairs: CountryPair[] = [
      { fromIso2: 'GB', toIso2: 'TH', count: 1 },
      { fromIso2: 'DE', toIso2: 'TH', count: 9 },
      { fromIso2: 'FR', toIso2: 'TH', count: 5 },
    ];
    const inbound = buildInboundForCountry(pairs, 'TH', 2, names);
    expect(inbound.map((i) => i.fromIso2)).toEqual(['DE', 'FR']);
  });
});

describe('computeCountryCentroids', () => {
  it('weights a country centroid toward its busier airport', () => {
    const airports = [
      airport(1, 'Thailand', 13.75, 100.49), // Bangkok-ish, busy
      airport(2, 'Thailand', 7.89, 98.4), // Phuket-ish, quiet
      airport(3, 'Japan', 35.68, 139.77),
    ];
    const routes: Route[] = [
      { sourceAirportId: 1, destAirportId: 3 },
      { sourceAirportId: 1, destAirportId: 3 },
      { sourceAirportId: 1, destAirportId: 3 },
      { sourceAirportId: 2, destAirportId: 3 },
    ];
    const centroids = computeCountryCentroids(airports, routes, new Set(['TH', 'JP']));
    const th = centroids.get('TH')!;
    // Weighted mean should sit much closer to the busy airport (id 1) than the midpoint.
    const midpoint = (13.75 + 7.89) / 2;
    expect(th.lat).toBeGreaterThan(midpoint);
  });

  it('falls back to a simple mean when a country of interest has no routed airports', () => {
    const airports = [airport(1, 'Thailand', 10, 20)];
    const centroids = computeCountryCentroids(airports, [], new Set(['TH']));
    expect(centroids.get('TH')).toEqual({ lat: 10, lng: 20 });
  });
});

describe('parseAirports / parseRoutes', () => {
  it('handles quoted fields containing commas', () => {
    const raw = `1,"Some, Airport","City","Country","XXX","XXXX",1.5,2.5,0,0,"U","Tz","airport","OurAirports"`;
    const airports = parseAirports(raw);
    expect(airports).toHaveLength(1);
    expect(airports[0]?.name).toBe('Some, Airport');
    expect(airports[0]?.lat).toBeCloseTo(1.5);
  });

  it('treats \\N as null for IATA and skips rows with non-numeric airport ids', () => {
    const raw = [
      `1,"A","City","Country",\\N,"XXXX",1,2,0,0,"U","Tz","airport","OurAirports"`,
      `not-a-number,"B","City","Country","YYY","YYYY",1,2,0,0,"U","Tz","airport","OurAirports"`,
    ].join('\n');
    const airports = parseAirports(raw);
    expect(airports).toHaveLength(1);
    expect(airports[0]?.iata).toBeNull();
  });

  it('skips routes with a non-numeric source/destination airport id', () => {
    const raw = ['2B,410,AER,2965,KZN,2990,,0,CR2', 'XX,1,ZZZ,\\N,KZN,2990,,0,CR2'].join('\n');
    const routes = parseRoutes(raw);
    expect(routes).toEqual([{ sourceAirportId: 2965, destAirportId: 2990 }]);
  });
});
