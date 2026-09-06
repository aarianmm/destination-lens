/**
 * Fetches the OpenFlights route-network dataset and caches the raw files under
 * `pipeline/cache/` (gitignored) so re-runs don't hit the network again. This dataset
 * is rarely updated upstream (effectively frozen since ~2014) and the pipeline only
 * re-runs this stage manually, so a simple existence check is enough cache invalidation.
 *
 * Source: jpatokal/openflights on GitHub — the actual home of the OpenFlights data/
 * directory (the "openflights/openflights" org referenced in older docs does not exist).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureParent } from '../lib/paths.js';
import { log } from '../lib/log.js';

const AIRPORTS_URL =
  'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';
const ROUTES_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat';

async function fetchCached(url: string, cachePath: string): Promise<string> {
  if (existsSync(cachePath)) {
    log.step('flights', `using cached ${cachePath}`);
    return readFileSync(cachePath, 'utf8');
  }
  log.step('flights', `fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  writeFileSync(ensureParent(cachePath), text, 'utf8');
  return text;
}

export async function loadOpenFlightsData(
  cacheDir: string,
): Promise<{ airportsRaw: string; routesRaw: string }> {
  const [airportsRaw, routesRaw] = await Promise.all([
    fetchCached(AIRPORTS_URL, join(cacheDir, 'airports.dat')),
    fetchCached(ROUTES_URL, join(cacheDir, 'routes.dat')),
  ]);
  return { airportsRaw, routesRaw };
}
