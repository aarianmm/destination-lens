/**
 * AGENT F owns this module.
 *
 * Wikipedia REST "page summary" lookup for a destination's lead image. No image is
 * a completely normal, expected outcome (many destinations have none, or the
 * article is a disambiguation/stub) — the app has a designed gradient fallback for
 * this, so we return `undefined` rather than treating it as an error. Only
 * unexpected failures (network errors) are logged; a 404 is silent and routine.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, ensureParent } from '../lib/paths.js';
import { log } from '../lib/log.js';

export type LeadImage = { url: string; attribution: string; sourceUrl: string };

// Wikimedia asks API consumers to identify themselves in the User-Agent with a
// project URL — no personal contact details, just something that lets Wikimedia
// operators trace unexpected traffic back to a project if they ever need to.
const USER_AGENT =
  'DestinationLensBot/0.1 (+https://github.com/aarianmm/destination-lens; static travel-discovery data pipeline)';

const WIKI_SUMMARY_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary';

type WikiSummaryBody = {
  title?: string;
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

type CacheEntry = { found: true; image: LeadImage } | { found: false };

function cachePathFor(cacheDir: string, wikipediaTitle: string): string {
  const safe = encodeURIComponent(wikipediaTitle);
  return join(cacheDir, `${safe}.json`);
}

function readCache(path: string): CacheEntry | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CacheEntry;
  } catch {
    return undefined; // no cache yet, or it's corrupt — either way, just refetch
  }
}

function writeCache(path: string, entry: CacheEntry): void {
  try {
    writeFileSync(ensureParent(path), JSON.stringify(entry), 'utf8');
  } catch (err) {
    log.warn('enrich', `failed to write wikipedia cache entry at ${path}: ${String(err)}`);
  }
}

export type FetchLeadImageOptions = {
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Defaults to `pipeline/cache/wikipedia`. */
  cacheDir?: string;
};

export async function fetchLeadImage(
  wikipediaTitle: string,
  opts: FetchLeadImageOptions = {},
): Promise<LeadImage | undefined> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cacheDir = opts.cacheDir ?? join(CACHE_DIR, 'wikipedia');
  const cachePath = cachePathFor(cacheDir, wikipediaTitle);

  const cached = readCache(cachePath);
  if (cached) return cached.found ? cached.image : undefined;

  try {
    const res = await fetchImpl(`${WIKI_SUMMARY_BASE}/${encodeURIComponent(wikipediaTitle)}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });

    if (!res.ok) {
      // 404 (no article/disambiguation) is routine, not an error worth logging.
      writeCache(cachePath, { found: false });
      return undefined;
    }

    const body = (await res.json()) as WikiSummaryBody;
    const imageUrl = body.originalimage?.source ?? body.thumbnail?.source;
    if (!imageUrl) {
      writeCache(cachePath, { found: false });
      return undefined;
    }

    const image: LeadImage = {
      url: imageUrl,
      attribution: `Photo via Wikipedia — "${body.title ?? wikipediaTitle}"`,
      sourceUrl:
        body.content_urls?.desktop?.page ??
        `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipediaTitle)}`,
    };
    writeCache(cachePath, { found: true, image });
    return image;
  } catch (err) {
    // Network hiccups etc: degrade gracefully, this is not fatal to the run.
    log.warn(
      'enrich',
      `wikipedia lookup failed for "${wikipediaTitle}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}
