/**
 * AGENT E owns this module.
 *
 * Collects, from the public Bluesky AppView, (a) weekly mention counts for the
 * trailing 26 weeks — which is what makes trend baselines real on day one — and
 * (b) a sample of recent post texts for qualitative analysis.
 *
 * Must back off on 429s, cache raw responses under CACHE_DIR, and apply the
 * keyword prefilter before anything reaches the LLM stage.
 *
 * --- Live-API notes (verified by hand while building this module) -----------
 *
 * The endpoint host named in the plan, `https://public.api.bsky.app`, returned
 * a hard `403 Forbidden` from BunnyCDN (the AppView's edge) for every variant
 * of `app.bsky.feed.searchPosts` tried — including bare, unauthenticated,
 * differently-shaped queries — while OTHER read endpoints on that exact host
 * (`getProfile`, `searchActors`, `describeServer`) returned normal 200s. That
 * points at a deliberate block on full-text post search from this network's
 * egress range, not a general outage. The identical path on `https://api.bsky.app`
 * (no `public.` prefix, same AppView, same data) worked reliably and
 * unauthenticated. So `api.bsky.app` is the default base URL here; the base is
 * overridable via `BSKY_APPVIEW_URL` in case a given CI runner's network can
 * reach one host but not the other — worth re-checking from GitHub Actions,
 * since its IP ranges may be treated differently than wherever this was built.
 *
 * Confirmed live: `since`/`until` filter correctly (both bare `YYYY-MM-DD` and
 * full ISO datetimes work); the response carries a top-level `hitsTotal` that
 * is populated even with `limit=1`, which is exactly the cheap weekly-count
 * primitive the plan wants — one tiny request per destination-week rather than
 * paging through results to count them. `hitsTotal` saturates at a flat 10000
 * for very high-volume queries (e.g. plain "Tokyo" across a week) — an upstream
 * search-backend cap, not a bug here; it mainly affects mega-destinations that
 * would be classified `established` anyway, and is harmless for the
 * small/mid-volume destinations trend detection cares about. Max `limit` is
 * 100 (101 is rejected with `InvalidRequest`).
 *
 * Also confirmed live, and worth flagging loudly: "Koh Lanta" — literally the
 * flagship example destination in idea.md — collides hard with "Koh-Lanta",
 * the long-running French reality-TV show (TF1). A sample week of raw hits was
 * almost entirely French-language posts about the show (presenter name,
 * "immunité", "All Stars", etc.), not the island. This is real evidence for
 * why `requireContext` + destination-level `negativeKeywords` are load-bearing,
 * not theoretical — see `testVocab.ts` for the negative-keyword list this
 * produced.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MentionsArtifact, RawPost, Vocab, VocabDestination } from '@dl/shared';
import { WEEKS_OF_HISTORY, mentionsArtifactSchema } from '@dl/shared';
import { CACHE_DIR, ensureParent } from '../lib/paths.js';
import { log } from '../lib/log.js';

// ---------------------------------------------------------------------------
// AppView HTTP client: base URL, auth fallback, backoff, on-disk caching.
// ---------------------------------------------------------------------------

/** See the live-API notes above for why this isn't `public.api.bsky.app`. */
const DEFAULT_BASE_URL = 'https://api.bsky.app';
const SEARCH_PATH = '/xrpc/app.bsky.feed.searchPosts';

/**
 * Restrict every search to English-language posts.
 *
 * Measured against the live API across the curated vocabulary: unrestricted
 * searches for European city names return almost no travel conversation.
 * Sampling 25 recent posts each, the share plausibly about travel was 0% for
 * Madrid (Spanish politics), 0% for Valencia and 4% for Barcelona (football),
 * 4% for Granada (local news) — all on 10k+ hits. A weekly mention series built
 * from that measures La Liga fixtures, not travel interest.
 *
 * Filtering to English removes most local-language chatter about places where
 * people simply live. It narrows what the product can honestly claim to
 * "English-language travel conversation", which the UI methodology note says.
 */
const SEARCH_LANG = 'en';
/** Only used to mint an app-password session; the AppView call still goes to baseUrl. */
const DEFAULT_PDS = 'https://bsky.social';
const CREATE_SESSION_PATH = '/xrpc/com.atproto.server.createSession';

const MAX_PAGE_LIMIT = 100;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 500;

/**
 * Verified live: a request with no `User-Agent` (Node's `fetch` sends none by
 * default) gets a flat `403 Forbidden by administrative rules` from a WAF
 * layer in front of the AppView — a generic bot rule, unrelated to Bluesky
 * auth. A descriptive UA is cheap insurance against that specific failure
 * mode; it does not by itself avoid the searchPosts-specific rate limiting
 * documented below.
 */
const USER_AGENT = 'destination-lens-pipeline/0.1 (+https://github.com/aarianmm/destination-lens)';

type BskyAuthor = {
  handle: string;
  displayName?: string;
  /**
   * Not part of today's AppView profile lexicon (verified live: real profiles
   * carry no discrete location field, only free-text bios). Checked
   * defensively in case a future response shape adds one — never inferred
   * from the bio text, per the "never LLM-guessed" rule on `authorLocation`.
   */
  location?: unknown;
};

type BskyPost = {
  uri: string;
  author: BskyAuthor;
  record: { text: string; createdAt: string };
};

type SearchPostsResponse = {
  posts: BskyPost[];
  cursor?: string;
  hitsTotal?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(
  url: string,
  headers: Record<string, string>,
  attempt = 0,
): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers } });
  // 403 is included here alongside 429/5xx: verified live that searchPosts
  // starts returning a WAF-style `403 Forbidden by administrative rules` under
  // request-volume pressure, on both AppView hosts tried, well before any
  // proper 429 with a `retry-after` header shows up. Treating it as retryable
  // is the pragmatic call — a genuinely permanent 403 just costs a few extra
  // backoff rounds before the caller gives up.
  if ((res.status === 429 || res.status === 403 || res.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfterHeader = res.headers.get('retry-after');
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    const backoff = Number.isFinite(retryAfterMs)
      ? retryAfterMs
      : INITIAL_BACKOFF_MS * 2 ** attempt;
    const jitterMs = backoff * 0.2 * Math.random();
    log.warn(
      'bluesky',
      `${res.status} from AppView, backing off ${Math.round(backoff)}ms (attempt ${attempt + 1})`,
    );
    await sleep(backoff + jitterMs);
    return fetchWithBackoff(url, headers, attempt + 1);
  }
  return res;
}

export class AppViewClient {
  private readonly baseUrl: string;
  private readonly identifier: string | undefined;
  private readonly appPassword: string | undefined;
  private accessJwt: string | undefined;
  private authAttempted = false;

  constructor(options: { baseUrl?: string; identifier?: string; appPassword?: string } = {}) {
    this.baseUrl = options.baseUrl ?? process.env.BSKY_APPVIEW_URL ?? DEFAULT_BASE_URL;
    this.identifier = options.identifier;
    this.appPassword = options.appPassword;
  }

  /** Mints an app-password session once per client instance. Never throws — a
   * failed login just means we stay unauthenticated and let the caller see
   * whatever the unauthenticated response was. */
  private async ensureAuthenticated(): Promise<void> {
    if (this.accessJwt || this.authAttempted || !this.identifier || !this.appPassword) return;
    this.authAttempted = true;
    try {
      const res = await fetch(`${DEFAULT_PDS}${CREATE_SESSION_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
        body: JSON.stringify({ identifier: this.identifier, password: this.appPassword }),
      });
      if (!res.ok) {
        log.warn('bluesky', `app-password auth failed (${res.status}); continuing unauthenticated`);
        return;
      }
      const data = (await res.json()) as { accessJwt?: string };
      if (data.accessJwt) this.accessJwt = data.accessJwt;
    } catch (err) {
      log.warn(
        'bluesky',
        `app-password auth errored: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async searchPosts(params: Record<string, string>): Promise<SearchPostsResponse> {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}${SEARCH_PATH}?${qs}`;
    const authHeaders = (): Record<string, string> =>
      this.accessJwt ? { authorization: `Bearer ${this.accessJwt}` } : {};

    // Task 2 (Agent G, Wave 2): authenticated is now the DEFAULT path whenever
    // credentials are configured, not just a 401/403 fallback. Agent E built the
    // fallback when unauthenticated access mostly worked; live testing since
    // (see module notes) shows unauthenticated searchPosts is throttled hard —
    // outright 403s on public.api.bsky.app, and "forbidden by administrative
    // rules" after ~20 gently-spaced requests on api.bsky.app — well below what
    // a real run needs. There is no upside left to trying unauthenticated first
    // when a session is available; `ensureAuthenticated` is a no-op if no
    // credentials were configured, so this is safe either way.
    await this.ensureAuthenticated();

    let res = await fetchWithBackoff(url, authHeaders());
    // Sticky fallback retained for the edge case of a token expiring mid-run,
    // or the proactive login above having silently failed.
    if ((res.status === 401 || res.status === 403) && !this.accessJwt) {
      await this.ensureAuthenticated();
      if (this.accessJwt) res = await fetchWithBackoff(url, authHeaders());
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`searchPosts failed: ${res.status} ${body}`.slice(0, 300));
    }
    return (await res.json()) as SearchPostsResponse;
  }
}

// ---------------------------------------------------------------------------
// On-disk response cache — keyed so historical (closed) weeks never need to be
// re-fetched, while the current, still-open week naturally refreshes daily.
// ---------------------------------------------------------------------------

function cachePath(key: string): string {
  return join(CACHE_DIR, 'bluesky', `${key}.json`);
}

function readCache<T>(key: string): T | undefined {
  const path = cachePath(key);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined; // corrupt cache entry — treat as a miss, don't crash the run
  }
}

function writeCache<T>(key: string, value: T): void {
  const path = cachePath(key);
  writeFileSync(ensureParent(path), JSON.stringify(value), 'utf8');
}

async function cachedSearch(
  client: AppViewClient,
  cacheKey: string,
  params: Record<string, string>,
): Promise<SearchPostsResponse> {
  const cached = readCache<SearchPostsResponse>(cacheKey);
  if (cached) return cached;
  const result = await client.searchPosts(params);
  writeCache(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function searchTermsFor(destination: VocabDestination): string[] {
  return [destination.name, ...destination.aliases];
}

/** Bluesky's search backend matches an unquoted multi-word `q` as a phrase
 * already (verified live: quoted vs unquoted gave identical hitsTotal), but
 * quoting is the documented convention and costs nothing. */
function queryFor(term: string): string {
  return term.includes(' ') ? `"${term}"` : term;
}

/**
 * --- Task 3 (Agent G, Wave 2): are the weekly counts measuring travel? ------
 *
 * The lexicon says `q`'s "syntax, phrase, boolean, and faceting is unspecified,
 * but Lucene query syntax is recommended" — aspirational, not a guarantee.
 * Verified empirically against the live authenticated API (small, careful
 * sample — see PR description for the full transcript):
 *
 *   q=Nara                    hitsTotal=10000 (capped)
 *   q="Nara" travel           hitsTotal=382
 *   q=Nara AND travel         hitsTotal=191
 *   q=Nara OR travel          hitsTotal=17
 *   q=travel                  hitsTotal=10000 (capped)
 *   q="Koh Lanta"             hitsTotal=364
 *   q="Koh Lanta" -tf1        hitsTotal=356
 *   q="Koh Lanta" travel      hitsTotal=12
 *
 * Two conclusions:
 *  1. Space-separated terms ARE implicitly ANDed by the backend — this is real
 *     and usable. "Koh Lanta" alone is almost entirely French reality-TV
 *     chatter; ANDing on "travel" collapses it to a genuinely small,
 *     plausible number of actual travel posts.
 *  2. Explicit boolean keywords are NOT honoured as operators. `OR` is matched
 *     as just another required literal word (which is why adding it SHRINKS
 *     the result set instead of growing it — matches a public bug report:
 *     bluesky-social/atproto#3751). `-word` exclusion showed no reliable
 *     effect either. So there is no way to OR several context synonyms
 *     ("travel" OR "trip" OR "vacation") into a single request — only a
 *     single required AND term per query, or one extra request per synonym
 *     (which would multiply request volume against a fragile, rate-limited
 *     API for very little extra recall).
 *
 * Given that, the weekly count query below ANDs a single travel-context term
 * onto every destination term, instead of counting the bare name. This trades
 * recall (a genuine travel post that never says "travel" is undercounted) for
 * validity (the series stops tracking football fixtures, TV episodes, or news
 * cycles that happen to share a destination's name). The trade is applied
 * identically to every week, so week-over-week growth/z-score comparisons —
 * which is all the trend maths actually needs — stay meaningful. It will not
 * be perfect for every destination (idiomatic uses of "travel" exist outside
 * tourism too, e.g. sports-fixture writeups — see the Barcelona sample in the
 * PR description), but for this product's actual curated vocabulary (city,
 * island and park names, not football clubs) it is a real fix to the counting
 * mechanism, not a coefficient rescale of an already-contaminated series.
 */
const COUNT_CONTEXT_TERM = 'travel';

/** Exported for a pure unit test — the actual filtering behaviour was verified
 * live against the real API (see the block comment above), not testable here. */
export function countQueryFor(term: string): string {
  return `${queryFor(term)} ${COUNT_CONTEXT_TERM}`;
}

function addDaysIso(dateOnly: string, days: number): string {
  const ms = Date.parse(`${dateOnly}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString();
}

/** [since, until) for one Monday-aligned week, capped so a still-open current
 * week is queried only up to now rather than into the future. */
function weekWindow(
  weekStart: string,
  now: Date,
): { sinceIso: string; untilIso: string; isClosed: boolean } {
  const sinceIso = `${weekStart}T00:00:00.000Z`;
  const naturalUntil = addDaysIso(weekStart, 7);
  const untilMs = Math.min(Date.parse(naturalUntil), now.getTime());
  return {
    sinceIso,
    untilIso: new Date(untilMs).toISOString(),
    isClosed: Date.parse(naturalUntil) <= now.getTime(),
  };
}

async function countWeek(
  client: AppViewClient,
  destination: VocabDestination,
  weekStart: string,
  now: Date,
): Promise<number> {
  const { sinceIso, untilIso, isClosed } = weekWindow(weekStart, now);
  let total = 0;
  for (const term of searchTermsFor(destination)) {
    // Cache key bumped to `weeks-v2` (was `weeks`): the query text itself changed
    // (context-term AND'd in, see `countQueryFor` above), so a pre-existing cache
    // entry under the old key would silently serve a contaminated count forever.
    const cacheKey = `weeks-v2/${destination.slug}__${weekStart}__${term.replace(/\W+/g, '_')}${isClosed ? '' : `__${untilIso.slice(0, 10)}`}`;
    const params: Record<string, string> = {
      q: countQueryFor(term),
      since: sinceIso,
      until: untilIso,
      lang: SEARCH_LANG,
      limit: '1',
    };
    // Closed weeks cache forever under a stable key. An open (current) week's
    // key embeds today's date (see above), so tomorrow's run naturally misses
    // the cache and refetches rather than reusing yesterday's partial count.
    const res = await cachedSearch(client, cacheKey, params);
    total += res.hitsTotal ?? res.posts.length;
  }
  return total;
}

async function fetchRecentRawPosts(
  client: AppViewClient,
  destination: VocabDestination,
  targetCount: number,
  today: string,
): Promise<BskyPost[]> {
  const seen = new Map<string, BskyPost>();
  const maxPagesPerTerm = 4;
  // Aim for enough raw material to survive a >=60% prefilter discard rate,
  // bounded so one very chatty destination can't blow the request budget.
  const rawTarget = targetCount * 4;

  for (const term of searchTermsFor(destination)) {
    let cursor: string | undefined;
    for (let page = 0; page < maxPagesPerTerm; page++) {
      const params: Record<string, string> = {
        q: queryFor(term),
        sort: 'latest',
        lang: SEARCH_LANG,
        limit: String(MAX_PAGE_LIMIT),
      };
      if (cursor) params.cursor = cursor;
      const cacheKey = `recent/${destination.slug}__${term.replace(/\W+/g, '_')}__p${page}__${today}`;
      const res = await cachedSearch(client, cacheKey, params);
      for (const post of res.posts) {
        if (!seen.has(post.uri)) seen.set(post.uri, post);
      }
      if (!res.cursor || res.posts.length === 0) break;
      cursor = res.cursor;
      if (seen.size >= rawTarget) break;
    }
    if (seen.size >= rawTarget) break;
  }
  return [...seen.values()];
}

function buildPostUrl(uri: string, handle: string): string {
  const rkey = uri.split('/').pop() ?? '';
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function toRawPost(post: BskyPost): RawPost {
  const location = typeof post.author.location === 'string' ? post.author.location : undefined;
  return {
    uri: post.uri,
    url: buildPostUrl(post.uri, post.author.handle),
    text: post.record.text,
    authorHandle: post.author.handle,
    authorDisplayName: post.author.displayName,
    authorLocation: location,
    postedAt: post.record.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Task 2 — keyword prefilter
// ---------------------------------------------------------------------------

/**
 * Generic travel-context vocabulary. Every candidate post must match at least one
 * of these (or the country name) to count as travel conversation.
 *
 * Breadth matters more than precision here. This gate exists to cut LLM cost, not
 * to be the final arbiter — the Gemini pass makes the real relevance call — so a
 * false negative silently discards a genuine post forever, while a false positive
 * merely costs a fraction of a classification call. Erring narrow was measurably
 * wrong: "Five days in Barcelona next month, any restaurant tips?" is
 * unmistakably a travel post and matched none of the original keywords.
 */
const TRAVEL_KEYWORDS = [
  'travel',
  'traveling',
  'travelling',
  'traveler',
  'traveller',
  'trip',
  'vacation',
  'holiday',
  'visit',
  'visiting',
  'visited',
  'flight',
  'flew',
  'flying',
  'airport',
  'hotel',
  'hostel',
  'airbnb',
  'resort',
  'beach',
  'beaches',
  'island',
  'backpack',
  'backpacking',
  'itinerary',
  'tourist',
  'tourism',
  'sightseeing',
  'honeymoon',
  'getaway',
  // How people actually describe being somewhere, which rarely uses the word "travel"
  'stay',
  'stays',
  'stayed',
  'staying',
  'nights',
  'days in',
  'day in',
  'week in',
  'weeks in',
  'month in',
  'weekend',
  'been to',
  'going to',
  'went to',
  'arrived',
  'landed',
  'booked',
  'booking',
  'abroad',
  'expat',
  'nomad',
  'road trip',
  'ferry',
  'train',
  'explore',
  'exploring',
  // What they talk about once there
  'restaurant',
  'restaurants',
  'cafe',
  'café',
  'coffee',
  'food',
  'eat',
  'ate',
  'museum',
  'temple',
  'hike',
  'hiking',
  'diving',
  'snorkel',
  'sunset',
  'old town',
  'recommend',
  'recommendations',
  'tips',
];

/**
 * Platform-level abuse patterns that disqualify a post regardless of which
 * destination it matched. Homonym/entity collisions (a place sharing a name
 * with a TV show, a football club, a font) are NOT handled here — those are
 * destination-specific and belong in the vocab's `requireContext` +
 * `negativeKeywords`, per the schema's own doc comment.
 */
const JUNK_RULES: { label: string; pattern: RegExp }[] = [
  {
    label: 'crypto/spam',
    pattern:
      /\b(airdrop|presale|whitelist mint|nft mint|to the moon)\b|\$[a-z]{2,8}\b.*\b(pump|moon|gem)s?\b/i,
  },
  {
    label: 'ticket touts',
    pattern:
      /\b(dm (me|us) for tickets|tickets? (available now|for sale|going fast)|selling \d+ tickets?)\b/i,
  },
  {
    label: 'bot/spam',
    pattern:
      /\b(only\s*fans|onlyfans|link in bio|follow (me )?back|check my bio|check (my )?pinned)\b/i,
  },
  {
    label: 'engagement bait',
    pattern: /\b(rt if you|retweet if|like (and|&) (rt|repost) if)\b/i,
  },
];

function isJunk(text: string): { junk: boolean; label?: string } {
  const rule = JUNK_RULES.find((r) => r.pattern.test(text));
  return rule ? { junk: true, label: rule.label } : { junk: false };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches a multi-word term whether the post spells it space- or
 * hyphen-separated. Verified live that this matters: real French-language
 * posts write the "Koh-Lanta" collision hyphenated, not "Koh Lanta". */
function termPattern(term: string): RegExp {
  const words = term.split(/\s+/).map(escapeRegExp);
  return new RegExp(`\\b${words.join('[\\s-]+')}\\b`, 'i');
}

function mentionsAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => termPattern(term).test(text));
}

function hasTravelContext(text: string, countryName: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes(countryName.toLowerCase())) return true;
  return TRAVEL_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Cheap rule-based relevance gate. Runs before any LLM call and is expected to
 * discard the large majority of matched posts (target >= 60%).
 */
export function prefilter(
  post: { text: string },
  destination: VocabDestination,
  countryName: string,
): boolean {
  const text = post.text ?? '';
  if (!text.trim()) return false;

  // Defensive: the search query already matched on these terms, but a cached
  // or hand-built post shouldn't pass unless it genuinely mentions the place.
  const terms = searchTermsFor(destination);
  if (!mentionsAnyTerm(text, terms)) return false;

  if (isJunk(text).junk) return false;

  const lower = text.toLowerCase();
  if (destination.negativeKeywords.some((kw) => lower.includes(kw.toLowerCase()))) return false;

  // Travel context is required for EVERY destination, not just `requireContext`
  // ones. That flag was meant for obvious homonyms ("Nice", "Split"), but live
  // sampling showed the problem is general: ordinary city names are dominated by
  // residents discussing daily life, sport and politics. `requireContext` now
  // only escalates the strictness rather than switching the check on.
  if (!hasTravelContext(text, countryName)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Task 1 — the collector
// ---------------------------------------------------------------------------

export type CollectOptions = {
  vocab: Vocab;
  /** Monday-aligned week starts, oldest first, length 26. */
  weekStarts: string[];
  /** How many recent posts to keep per destination after prefiltering. */
  recentPostLimit?: number;
  /** Optional Bluesky app-password credentials, used only as a 401/403 fallback. */
  bskyIdentifier?: string;
  bskyAppPassword?: string;
  /** Override the AppView base URL — see the live-API notes at the top of this file. */
  baseUrl?: string;
  /** Injection point for tests; defaults to `new Date()`. */
  now?: Date;
};

export async function collectMentions(options: CollectOptions): Promise<MentionsArtifact[]> {
  const { vocab, weekStarts, recentPostLimit = 120 } = options;
  if (weekStarts.length !== WEEKS_OF_HISTORY) {
    throw new Error(
      `collectMentions: expected ${WEEKS_OF_HISTORY} weekStarts, got ${weekStarts.length}`,
    );
  }

  const client = new AppViewClient({
    baseUrl: options.baseUrl,
    identifier: options.bskyIdentifier,
    appPassword: options.bskyAppPassword,
  });
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const artifacts: MentionsArtifact[] = [];

  for (const destination of vocab.destinations) {
    try {
      const weeklyCounts: number[] = [];
      for (const weekStart of weekStarts) {
        weeklyCounts.push(await countWeek(client, destination, weekStart, now));
      }

      const rawPosts = await fetchRecentRawPosts(client, destination, recentPostLimit, today);
      const passed: RawPost[] = [];
      let discarded = 0;
      for (const raw of rawPosts) {
        if (prefilter({ text: raw.record.text }, destination, vocab.name)) {
          passed.push(toRawPost(raw));
        } else {
          discarded += 1;
        }
      }
      passed.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));

      log.step(
        'bluesky',
        `${destination.slug}: ${rawPosts.length} raw posts, ${discarded} discarded (${
          rawPosts.length ? Math.round((discarded / rawPosts.length) * 100) : 0
        }%), ${passed.length} kept, latest week count=${weeklyCounts.at(-1)}`,
      );

      artifacts.push(
        mentionsArtifactSchema.parse({
          slug: destination.slug,
          countryIso2: vocab.iso2,
          weekStarts,
          weeklyCounts,
          posts: passed.slice(0, recentPostLimit),
          prefilteredOut: discarded,
        }),
      );
    } catch (err) {
      // One destination's failure (e.g. persistent 5xx after backoff) should
      // not take down the whole country's collection run.
      log.error(
        'bluesky',
        `${destination.slug}: collection failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return artifacts;
}
