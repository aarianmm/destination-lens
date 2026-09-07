/**
 * One-off diagnostic: issues a handful of authenticated `searchPosts` requests
 * with the exact query shapes production code uses (and a few isolating
 * variants — no `lang`, no `since`/`until`, bigger `limit`) and dumps the raw
 * response. Not part of the pipeline itself and not run automatically.
 *
 * Exists because "every weekly count came back 0 on the authenticated path,
 * even for Tokyo" is a symptom with several plausible causes (auth changes
 * the response shape; `lang=en` + `since`/`until` intersect to nothing;
 * errors silently defaulting to 0) that guessing-and-redeploying is a slow way
 * to distinguish. Run via `npm run probe:bsky -w pipeline` (needs
 * BSKY_IDENTIFIER/BSKY_APP_PASSWORD in the environment) or the pipeline
 * workflow's `probeOnly` dispatch input. Never commit its output — it may
 * contain real post text.
 */
import { log } from '../lib/log.js';

const SEARCH_PATH = '/xrpc/app.bsky.feed.searchPosts';
const CREATE_SESSION_PATH = '/xrpc/com.atproto.server.createSession';
const DEFAULT_PDS = 'https://bsky.social';
const USER_AGENT = 'destination-lens-pipeline-probe/0.1';

type SessionResponse = { accessJwt?: string; handle?: string; did?: string };

async function authenticate(identifier: string, appPassword: string): Promise<string | undefined> {
  const res = await fetch(`${DEFAULT_PDS}${CREATE_SESSION_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  const body = (await res.json().catch(() => ({}))) as SessionResponse;
  log.step('probe', `createSession: ${res.status} handle=${body.handle ?? '?'} did=${body.did ?? '?'}`);
  return body.accessJwt;
}

async function probe(
  baseUrl: string,
  accessJwt: string | undefined,
  label: string,
  params: Record<string, string>,
): Promise<void> {
  const qs = new URLSearchParams(params).toString();
  const url = `${baseUrl}${SEARCH_PATH}?${qs}`;
  const headers: Record<string, string> = { 'user-agent': USER_AGENT };
  if (accessJwt) headers.authorization = `Bearer ${accessJwt}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  log.step('probe', `--- ${label} :: ${JSON.stringify(params)} ---`);
  log.step('probe', `status=${res.status} authed=${Boolean(accessJwt)}`);
  log.step('probe', text.length > 1500 ? `${text.slice(0, 1500)}…(truncated)` : text);
}

async function main() {
  const baseUrl = process.env.BSKY_APPVIEW_URL ?? 'https://api.bsky.app';
  const identifier = process.env.BSKY_IDENTIFIER;
  const appPassword = process.env.BSKY_APP_PASSWORD;

  let accessJwt: string | undefined;
  if (identifier && appPassword) {
    accessJwt = await authenticate(identifier, appPassword);
    if (!accessJwt) log.warn('probe', 'authentication did not return an accessJwt — continuing unauthenticated');
  } else {
    log.warn('probe', 'no BSKY_IDENTIFIER/BSKY_APP_PASSWORD in env — testing unauthenticated only');
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  // Same window shape production `countWeek` uses, against a mega-destination
  // that should have unambiguous non-zero signal if anything is finding
  // matches at all.
  await probe(baseUrl, accessJwt, 'bare term, no lang, no window, limit=1', {
    q: 'Tokyo',
    limit: '1',
  });
  await probe(baseUrl, accessJwt, 'bare term + window, no lang, limit=1', {
    q: 'Tokyo',
    since: weekAgo,
    until: nowIso,
    limit: '1',
  });
  await probe(baseUrl, accessJwt, 'bare term + window + lang=en, limit=1 (prod shape minus context)', {
    q: 'Tokyo',
    since: weekAgo,
    until: nowIso,
    lang: 'en',
    limit: '1',
  });
  await probe(baseUrl, accessJwt, 'term+context + window + lang=en, limit=1 (exact prod shape)', {
    q: 'Tokyo travel',
    since: weekAgo,
    until: nowIso,
    lang: 'en',
    limit: '1',
  });
  await probe(baseUrl, accessJwt, 'term+context + window + lang=en, limit=10, sort=latest (see actual posts)', {
    q: 'Tokyo travel',
    since: weekAgo,
    until: nowIso,
    lang: 'en',
    limit: '10',
    sort: 'latest',
  });
  await probe(baseUrl, accessJwt, 'term+context, window, NO lang', {
    q: 'Tokyo travel',
    since: weekAgo,
    until: nowIso,
    limit: '1',
  });
}

main().catch((err: unknown) => {
  log.error('probe', err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
