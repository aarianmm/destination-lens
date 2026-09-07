/**
 * Builds the searchable index out of the published snapshots.
 *
 * Everything searchable already ships in files the app loads anyway: world.json
 * carries all 100 countries, and the ten covered country files carry their
 * destinations. Roughly 90 KB in total, so the whole index is assembled in one
 * go on first open rather than querying per keystroke -- and because it goes
 * through the shared snapshot cache, a later country screen visit is a cache
 * hit rather than a second fetch.
 */
import type { CountryItem, DestinationItem, SearchIndex } from './match.js';
import { loadCountry, loadMeta, loadWorld } from '../lib/snapshots.js';

/**
 * Only the fields the index actually reads. Narrow on purpose: the real
 * snapshot loaders satisfy it structurally, and tests can supply three-line
 * fixtures instead of schema-complete ones.
 */
export type IndexSources = {
  loadWorld: () => Promise<{ countries: CountryItem[] }>;
  loadMeta: () => Promise<{ countries: string[] }>;
  loadCountry: (iso2: string) => Promise<{
    iso2: string;
    name: string;
    destinations: Omit<DestinationItem, 'countryIso2' | 'countryName'>[];
  }>;
};

export async function buildSearchIndex(sources: IndexSources): Promise<SearchIndex> {
  // world.json is the one hard dependency: without it there is nothing to
  // search, so its failure propagates rather than yielding an empty index that
  // would look like "no results" to the user.
  const world = await sources.loadWorld();

  let covered: string[] = [];
  try {
    covered = (await sources.loadMeta()).countries;
  } catch {
    // Countries alone are still worth searching.
  }

  const files = await Promise.all(
    covered.map((iso2) => sources.loadCountry(iso2).catch(() => null)),
  );

  const destinations: DestinationItem[] = [];
  for (const file of files) {
    if (!file) continue; // that country's snapshot is missing; the rest still work
    for (const d of file.destinations) {
      destinations.push({ ...d, countryIso2: file.iso2, countryName: file.name });
    }
  }

  return { countries: world.countries, destinations };
}

let pending: Promise<SearchIndex> | null = null;

/** The app's index, built once per session on first use. */
export function getSearchIndex(): Promise<SearchIndex> {
  pending ??= buildSearchIndex({ loadWorld, loadMeta, loadCountry }).catch((error: unknown) => {
    pending = null; // let the next open retry rather than caching the failure
    throw error;
  });
  return pending;
}
