/**
 * Snapshot loading — the only place the app talks to `data/`.
 *
 * Every response is validated against the frozen schema, so a bad pipeline run
 * surfaces as a clear error rather than a mysterious render crash.
 */
import {
  countrySchema,
  destinationSchema,
  metaSchema,
  worldSchema,
  type Country,
  type Destination,
  type Meta,
  type World,
} from '@dl/shared';
import type { ZodType } from 'zod';

const cache = new Map<string, Promise<unknown>>();

export class SnapshotError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly kind: 'missing' | 'network' | 'invalid',
  ) {
    super(message);
    this.name = 'SnapshotError';
  }
}

async function load<T>(path: string, schema: ZodType<T>): Promise<T> {
  const existing = cache.get(path);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    let res: Response;
    try {
      res = await fetch(path);
    } catch (cause) {
      throw new SnapshotError(
        `Could not reach ${path}: ${cause instanceof Error ? cause.message : 'network error'}`,
        path,
        'network',
      );
    }
    if (res.status === 404) {
      throw new SnapshotError(`No snapshot at ${path}`, path, 'missing');
    }
    if (!res.ok) {
      throw new SnapshotError(`${res.status} loading ${path}`, path, 'network');
    }
    // A 200 is not proof the file exists. Both the Vite dev server and Cloudflare's
    // `not_found_handling: single-page-application` answer an unmatched path with
    // index.html and a 200, so an absent snapshot arrives here looking like success.
    // Treat a non-JSON body as missing rather than letting JSON.parse throw something
    // unrecognisable — the uncovered-country UI depends on this being `missing`.
    if (!(res.headers.get('content-type') ?? '').includes('json')) {
      throw new SnapshotError(`No snapshot at ${path}`, path, 'missing');
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new SnapshotError(`No snapshot at ${path}`, path, 'missing');
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new SnapshotError(
        `Snapshot at ${path} does not match the schema: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        path,
        'invalid',
      );
    }
    return parsed.data;
  })();

  cache.set(path, promise);
  // A failed load should not be cached forever — let the next attempt retry.
  promise.catch(() => cache.delete(path));
  return promise;
}

export const loadMeta = (): Promise<Meta> => load('/data/meta.json', metaSchema);
export const loadWorld = (): Promise<World> => load('/data/world.json', worldSchema);
export const loadCountry = (iso2: string): Promise<Country> =>
  load(`/data/country/${iso2.toUpperCase()}.json`, countrySchema);
export const loadDestination = (slug: string): Promise<Destination> =>
  load(`/data/destination/${slug}.json`, destinationSchema);
