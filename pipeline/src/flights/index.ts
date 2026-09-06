/**
 * AGENT D owns this module.
 *
 * Turns the OpenFlights `airports.dat` + `routes.dat` datasets into an aggregated
 * route-network flow graph. This is a route network, NOT passenger volume — the UI
 * must never imply otherwise. The dataset is also an ~2014-era snapshot (OpenFlights
 * has been effectively frozen since); `source` on the returned artifact says so
 * explicitly for UI attribution.
 */
import { flowsArtifactSchema, type FlowsArtifact } from '@dl/shared';
import { CACHE_DIR } from '../lib/paths.js';
import { log } from '../lib/log.js';
import { loadOpenFlightsData } from './download.js';
import { parseAirports, parseRoutes } from './parse.js';
import {
  aggregateCountryRoutes,
  buildCountryNameByIso2,
  buildInboundForCountry,
  computeCountryCentroids,
  rankAndNormalize,
} from './aggregate.js';

export const OPENFLIGHTS_SOURCE =
  'OpenFlights route network (jpatokal/openflights, data as of ~2014) — counts of scheduled ' +
  'routes between airports, aggregated to country level. This reflects route network breadth, ' +
  'NOT passenger volume or real-time traffic.';

const DEFAULT_MAX_FLOWS = 200;
const DEFAULT_INBOUND_TOP_N = 15;

export type BuildFlowsOptions = {
  /** iso2 codes needing per-country inbound breakdowns. */
  countries: string[];
  /** Cap on globally-returned flows before normalisation. */
  maxFlows?: number;
};

export async function buildFlows(options: BuildFlowsOptions): Promise<FlowsArtifact> {
  const maxFlows = options.maxFlows ?? DEFAULT_MAX_FLOWS;
  const covered = options.countries.map((c) => c.toUpperCase());

  const { airportsRaw, routesRaw } = await loadOpenFlightsData(CACHE_DIR);
  const airports = parseAirports(airportsRaw);
  const routes = parseRoutes(routesRaw);
  log.step('flights', `parsed ${airports.length} airports, ${routes.length} routes`);

  const { pairs, unmapped } = aggregateCountryRoutes(airports, routes);
  if (unmapped.size > 0) {
    const summary = [...unmapped.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} (${count} airports)`)
      .join(', ');
    log.warn('flights', `unmapped OpenFlights country names, dropped from aggregation: ${summary}`);
  }

  const flows = rankAndNormalize(pairs, maxFlows);
  log.step('flights', `ranked ${pairs.length} cross-border pairs down to top ${flows.length}`);

  const countryNameByIso2 = buildCountryNameByIso2(airports);

  const inboundByCountry: Record<string, ReturnType<typeof buildInboundForCountry>> = {};
  for (const iso2 of covered) {
    inboundByCountry[iso2] = buildInboundForCountry(
      pairs,
      iso2,
      DEFAULT_INBOUND_TOP_N,
      countryNameByIso2,
    );
  }

  // Only compute (and publish) centroids for countries that actually appear somewhere
  // in the output — no point carrying every OpenFlights country when most never surface.
  const isoOfInterest = new Set<string>();
  for (const f of flows) {
    isoOfInterest.add(f.fromIso2);
    isoOfInterest.add(f.toIso2);
  }
  for (const iso2 of covered) {
    isoOfInterest.add(iso2);
    for (const inbound of inboundByCountry[iso2] ?? []) isoOfInterest.add(inbound.fromIso2);
  }

  const centroids = computeCountryCentroids(airports, routes, isoOfInterest);

  const countries = [...isoOfInterest]
    .filter((iso2) => centroids.has(iso2) && countryNameByIso2.has(iso2))
    .map((iso2) => {
      const centroid = centroids.get(iso2)!;
      return {
        iso2,
        name: countryNameByIso2.get(iso2)!,
        lat: centroid.lat,
        lng: centroid.lng,
      };
    })
    .sort((a, b) => a.iso2.localeCompare(b.iso2));

  const missingCentroids = [...isoOfInterest].filter(
    (iso2) => !centroids.has(iso2) || !countryNameByIso2.has(iso2),
  );
  if (missingCentroids.length > 0) {
    log.warn('flights', `no centroid/name available for: ${missingCentroids.join(', ')}`);
  }

  const artifact: FlowsArtifact = {
    generatedAt: new Date().toISOString(),
    source: OPENFLIGHTS_SOURCE,
    countries,
    flows,
    inboundByCountry,
  };

  return flowsArtifactSchema.parse(artifact);
}
