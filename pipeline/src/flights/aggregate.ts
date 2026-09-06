/**
 * Pure aggregation logic over parsed OpenFlights rows. Kept free of I/O so it can be
 * unit-tested directly against small synthetic fixtures (see pipeline/test/flights.test.ts).
 */
import type { Airport, Route } from './parse.js';
import { displayNameForIso2, mapCountryNameToIso2 } from './countryCodes.js';

export type CountryPair = { fromIso2: string; toIso2: string; count: number };

export type AggregateResult = {
  /** Cross-border country->country route counts (domestic routes excluded). */
  pairs: CountryPair[];
  /** Raw OpenFlights country names that had no iso2 mapping, with how many airports used them. */
  unmapped: Map<string, number>;
};

/**
 * Aggregates routes into country->country counts, dropping:
 *  - routes referencing an unknown airport id
 *  - routes where either airport's country has no iso2 mapping (reported, not silently dropped)
 *  - domestic routes (from === to)
 */
export function aggregateCountryRoutes(airports: Airport[], routes: Route[]): AggregateResult {
  const airportById = new Map<number, Airport>();
  for (const a of airports) airportById.set(a.id, a);

  const unmapped = new Map<string, number>();
  const iso2ByAirportId = new Map<number, string>();
  for (const a of airports) {
    const iso2 = mapCountryNameToIso2(a.country);
    if (iso2) {
      iso2ByAirportId.set(a.id, iso2);
    } else {
      unmapped.set(a.country, (unmapped.get(a.country) ?? 0) + 1);
    }
  }

  const counts = new Map<string, CountryPair>();
  for (const r of routes) {
    const fromIso2 = iso2ByAirportId.get(r.sourceAirportId);
    const toIso2 = iso2ByAirportId.get(r.destAirportId);
    if (!fromIso2 || !toIso2) continue;
    if (fromIso2 === toIso2) continue; // domestic, out of scope for a "who flies where" globe

    const key = `${fromIso2}|${toIso2}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { fromIso2, toIso2, count: 1 });
    }
  }

  return { pairs: [...counts.values()], unmapped };
}

export type RankedFlow = { fromIso2: string; toIso2: string; weight: number };

/**
 * Ranks pairs by route count, caps to `maxFlows` AFTER ranking (never before — a cap
 * applied pre-sort would keep arbitrary insertion-order pairs instead of the biggest
 * routes), then normalises weight 0..1 against the largest surviving count.
 */
export function rankAndNormalize(pairs: CountryPair[], maxFlows: number): RankedFlow[] {
  const top = [...pairs].sort((a, b) => b.count - a.count).slice(0, maxFlows);
  const max = top[0]?.count ?? 0;
  return top.map((p) => ({
    fromIso2: p.fromIso2,
    toIso2: p.toIso2,
    weight: max > 0 ? p.count / max : 0,
  }));
}

export type RankedInbound = { fromIso2: string; fromName: string; weight: number };

/**
 * Top inbound origins for a single covered country, normalised 0..1 against its own
 * largest inbound route (independent of the global flows normalisation).
 */
export function buildInboundForCountry(
  pairs: CountryPair[],
  toIso2: string,
  topN: number,
  countryNameByIso2: Map<string, string>,
): RankedInbound[] {
  const incoming = pairs.filter((p) => p.toIso2 === toIso2);
  const top = [...incoming].sort((a, b) => b.count - a.count).slice(0, topN);
  const max = top[0]?.count ?? 0;
  return top.map((p) => ({
    fromIso2: p.fromIso2,
    fromName: countryNameByIso2.get(p.fromIso2) ?? p.fromIso2,
    weight: max > 0 ? p.count / max : 0,
  }));
}

export type Centroid = { lat: number; lng: number };

/**
 * A country's representative point: the route-weighted mean of its airports' coordinates,
 * weighted by how many routes (in either direction, domestic included) touch each airport.
 * This avoids hard-coding a centroid table and naturally favours whichever hub actually
 * carries the country's air traffic (e.g. Bangkok over a geometric midpoint of Thailand).
 */
export function computeCountryCentroids(
  airports: Airport[],
  routes: Route[],
  isoOfInterest: ReadonlySet<string>,
): Map<string, Centroid> {
  const airportById = new Map<number, Airport>();
  for (const a of airports) airportById.set(a.id, a);

  const routeWeightByAirportId = new Map<number, number>();
  const bump = (id: number) => routeWeightByAirportId.set(id, (routeWeightByAirportId.get(id) ?? 0) + 1);
  for (const r of routes) {
    bump(r.sourceAirportId);
    bump(r.destAirportId);
  }

  const sums = new Map<string, { latSum: number; lngSum: number; weight: number }>();
  const simpleSums = new Map<string, { latSum: number; lngSum: number; count: number }>();

  for (const a of airports) {
    const iso2 = mapCountryNameToIso2(a.country);
    if (!iso2 || !isoOfInterest.has(iso2)) continue;

    const simple = simpleSums.get(iso2) ?? { latSum: 0, lngSum: 0, count: 0 };
    simple.latSum += a.lat;
    simple.lngSum += a.lng;
    simple.count += 1;
    simpleSums.set(iso2, simple);

    const weight = routeWeightByAirportId.get(a.id) ?? 0;
    if (weight <= 0) continue;
    const entry = sums.get(iso2) ?? { latSum: 0, lngSum: 0, weight: 0 };
    entry.latSum += a.lat * weight;
    entry.lngSum += a.lng * weight;
    entry.weight += weight;
    sums.set(iso2, entry);
  }

  const centroids = new Map<string, Centroid>();
  for (const iso2 of isoOfInterest) {
    const weighted = sums.get(iso2);
    if (weighted && weighted.weight > 0) {
      centroids.set(iso2, { lat: weighted.latSum / weighted.weight, lng: weighted.lngSum / weighted.weight });
      continue;
    }
    const simple = simpleSums.get(iso2);
    if (simple && simple.count > 0) {
      centroids.set(iso2, { lat: simple.latSum / simple.count, lng: simple.lngSum / simple.count });
    }
  }
  return centroids;
}

/**
 * First-seen raw country name per iso2, used as the fallback display name when no
 * override is configured (see countryCodes.ts).
 */
export function buildCountryNameByIso2(airports: Airport[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const a of airports) {
    const iso2 = mapCountryNameToIso2(a.country);
    if (!iso2 || names.has(iso2)) continue;
    names.set(iso2, displayNameForIso2(iso2, a.country));
  }
  return names;
}
