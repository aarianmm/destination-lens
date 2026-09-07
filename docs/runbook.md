# Runbook

Operating the pipeline and deploys. For what the resulting numbers mean, read
[`data-and-limitations.md`](data-and-limitations.md) — this document is about
running the thing, not interpreting its output.

## Current status (read this first)

As of this writing, `pipeline/src/run.ts` on `main` is a stub that logs its
config and immediately throws (`"full pipeline run not wired yet — run
individual stages"`). This means the scheduled `pipeline.yml` workflow **will
fail** on `main` today. End-to-end wiring exists and has been run live
successfully in **PR #9** (`agent-g-pipeline`) — check whether it has merged
before relying on `npm run pipeline` / the cron job actually producing data.
Everything below describes the wired design (matching PR #9 and `PLAN.md`);
until it merges, each pipeline stage can still be exercised individually via
its own module/tests, and `npm run fixtures` remains the way to get realistic
JSON for frontend work.

## Secrets

Set these as GitHub Actions repository secrets (Settings → Secrets and
variables → Actions). None of them are needed for local frontend work against
fixtures.

| Secret | Used for | How to get it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `wrangler deploy` / `wrangler versions upload` in `deploy.yml` | Cloudflare dashboard → My Profile → API Tokens → Create Token. **Use the "Edit Cloudflare Workers" template** — it grants exactly the Workers-scoped permissions `wrangler` needs, nothing broader. |
| `CLOUDFLARE_ACCOUNT_ID` | Same deploy steps, to target the right Cloudflare account | Cloudflare dashboard → Workers & Pages → any Worker's overview page shows the Account ID in the right sidebar. |
| `GEMINI_API_KEY` | Post classification + destination synthesis in `pipeline/src/enrich/` | Google AI Studio (aistudio.google.com) → Get API key. Free tier is viable given the `MAX_LLM_CALLS` budget cap below. |
| `BSKY_IDENTIFIER` | Fallback auth for the Bluesky collector when unauthenticated requests get rate-limited | Your (or a dedicated) Bluesky handle, e.g. `you.bsky.social`. |
| `BSKY_APP_PASSWORD` | Paired with the identifier above | In the Bluesky app: Settings → App Passwords → Add App Password. **Never use your real account password** — this is exactly what app passwords exist to avoid. |

Why Bluesky auth exists at all: unauthenticated calls to the working AppView
host (`api.bsky.app`) get blocked after roughly 20 requests even when paced
gently, and `public.api.bsky.app` — the host originally planned — hard-403s
post search entirely regardless of auth. See `data-and-limitations.md` for
the full live-measured detail. The collector tries unauthenticated first and
only mints an app-password session on a 401/403, so these two secrets are a
fallback, not a hard requirement, but a real scheduled run will almost
certainly need them.

## Running the data pipeline

**Scheduled:** `pipeline.yml` runs on a daily cron (`0 3 * * *` UTC) against
every country in `ALL_COUNTRIES` (`pipeline/src/config.ts`), then commits any
changed files under `data/` straight to `main` — which triggers `deploy.yml`
and redeploys production. There's no PR step in this path; a bad pipeline run
becomes a bad production deploy on the same push. Rely on the run's own
safeguards (below) rather than review to catch problems.

**Manual (`workflow_dispatch`):** trigger `pipeline.yml` from the Actions tab
with two optional inputs:

- **`countries`** — comma-separated ISO2 codes (e.g. `TH,JP`) to restrict the
  run. Blank runs all covered countries. A partial run is safe to publish:
  the assembler only ever touches files for countries in this run and never
  deletes existing snapshots for the rest (`mergeMeta`/`mergeWorld` in
  `pipeline/src/assemble/index.ts`) — see the known partial-run ranking gap
  under "Known failure modes" below.
- **`dryRun`** — a checkbox. When true, the pipeline does everything —
  vocabulary load, flight-flow load, Bluesky collection, trend maths — except
  call Gemini and except write `data/`. This is the free, no-cost rehearsal:
  use it to confirm collection and trend classification behave before
  spending any LLM budget or touching production data.

**`MAX_LLM_CALLS`** (env var, default 400): a hard ceiling on Gemini calls for
the whole run. This is not a soft warning — exceeding it makes
`enrichDestination` throw, and `run.ts` treats that as fatal: it stops
enriching, logs the calls used so far, and **the run exits non-zero rather
than silently under-enriching and reporting success.** Destinations already
enriched before the cap hit keep their results; anything after it gets no
blurb/themes/sentiment for that run. The design intent, stated directly in
`pipeline/src/enrich/index.ts`'s module comment, is that overspending a
human's API budget silently is worse than a failed CI run. If you see this,
either raise `MAX_LLM_CALLS` for the next run or narrow `countries`.

**Caching:** raw upstream API responses (both Bluesky and, incidentally,
nothing else — Gemini calls aren't cached, only Bluesky search responses) are
cached to `pipeline/cache/` and restored between Actions runs via
`actions/cache`. Closed weeks cache under a stable key and are never
re-fetched; the current, still-open week's cache key embeds today's date so
tomorrow's run naturally refetches it. This cache is gitignored and never
committed — deleting it just means the next run re-pays the Bluesky rate-limit
cost for historical weeks, which is safe but slow.

## How deploys work

`deploy.yml` runs on every push to `main` and every PR:

- **Push to `main`** → `npx wrangler deploy` → production
  (https://destination-lens.amalhotrawk.workers.dev).
- **Pull request** → `npx wrangler versions upload --tag pr-<number>` → the
  resulting preview URL is posted/updated as a PR comment (look for the
  `<!-- dl-preview -->` marker). This is the surface for visually judging a
  change before merge.

Both paths run `npm run build` first, which (via `app/package.json`'s
`prebuild` script) syncs `data/` into `app/public/data` — so a build always
ships whatever is currently committed in `data/`, fixture or real.

`ci.yml` runs on every PR and push to `main` regardless of deploy: typecheck,
lint, `vitest run`, and a build. It gates nothing about the pipeline directly,
but the pipeline package is included in the workspace typecheck/lint/test, so
a broken pipeline stage fails CI the same as a broken frontend change.

## Adding a new covered country

1. **Write the vocabulary file**, `shared/vocab/{ISO2}.json`, matching
   `vocabSchema` in `shared/src/artifacts.ts`: country name/aliases/
   centroid/bounds, and 8–15 destinations each with `slug`, `name`,
   `aliases`, `lat`/`lng`, `wikipediaTitle`, and — critically —
   `requireContext`/`negativeKeywords` for anything that might collide with
   an unrelated word, place, brand, or piece of fiction. **Sample the live
   Bluesky search for every destination name before assuming it's clean** —
   every homonym problem documented in `data-and-limitations.md` (Koh Lanta,
   Rio de Janeiro, Nairobi, Madrid, Lima, Casablanca, and others) was found
   exactly this way, by looking at what a raw search actually returned, not
   by guessing in advance which names looked risky.
2. **Add the ISO2 code to `ALL_COUNTRIES`** in `pipeline/src/config.ts`.
3. **Regenerate the committed flight-flow artifact**: `npm run flights -w
   @dl/pipeline`. This is the one stage that hits the network for a large,
   rarely-changing dataset (OpenFlights) and writes a *committed* file,
   `pipeline/src/flights/flows.generated.json`, that the regular pipeline run
   reads instead of re-downloading. Skipping this step means the new
   country's inbound flows are simply absent even after everything else is
   wired up.
4. **Run a dry run** (`workflow_dispatch` with `countries` set to the new
   ISO2 and `dryRun` checked) to confirm vocabulary loads and Bluesky
   collection succeed before spending any Gemini budget.
5. **Run for real** with `countries` set to just the new code, review the
   resulting `data/country/{iso2}.json` and destination files, then let it
   ride on the next scheduled full run.

If you're developing the frontend against the new country before any of this
lands, add it to `shared/src/fixtures/seed.ts` instead — that's
fixture-only data, deliberately kept separate from the hand-verified pipeline
vocabulary.

## What to do when the pipeline fails

Every stage logs through `pipeline/src/lib/log.ts` as
`[<elapsed>s] [<stage>] message`, with `WARN`/`ERROR` prefixes for the other
two levels — grep the Actions run log by stage name (`bluesky`, `trends`,
`enrich`, `assemble`, `flights`, `vocab`, `run`) to isolate where it broke.

**Known failure modes, by design:**

- **`GEMINI_API_KEY is required for a non-dry run`** — the secret is missing
  or blank on a real (non-dry) run. Configuration error, not a transient
  failure; fix the secret.
- **`Gemini call budget exhausted (X/Y) — aborting run`** — hit
  `MAX_LLM_CALLS`. See above. Deliberate, not a bug.
- **`bluesky collection produced zero destinations for: <ISO2, ...>`** — a
  whole country returned no mentions at all. This is treated as a broken run,
  not a quiet one, on purpose: the same shape of failure happened once for
  real, when a stricter `postedAt` validation started silently rejecting
  every post and the run "succeeded" having collected nothing. A single
  *destination* failing is normal and expected (logged, skipped, doesn't
  fail the run) — it's a country going to zero across the board that signals
  something is actually broken (auth, network, a schema change upstream).
- **`no usable vocab for any of: ...`** — every requested country's
  `shared/vocab/{iso2}.json` failed to load. Check the file exists and is
  valid JSON matching `vocabSchema`.
- **`assemble: country {iso2} lists destination "{slug}" with no snapshot`**
  (or similar dangling-reference errors) — an internal consistency check in
  `assertNoDanglingReferences`. This should be structurally impossible given
  how `assemble()` builds its output; if you see it, something upstream
  handed the assembler inconsistent input, worth investigating as a real bug
  rather than retrying.
- **A destination silently missing from a country's page after a run** — not
  necessarily a failure. `assemble()` deliberately omits a vocab destination
  from output if the trends stage produced no result for it, rather than
  fabricating a status. Check the `bluesky`/`trends` stage logs for that
  specific slug.
- **A `data/*.json` file rejected for exceeding its size budget** — the
  assembler enforces `SIZE_BUDGETS` (world 300KB, country 150KB, destination
  60KB from `shared/src/schema.ts`) before writing anything, so a bloated
  destination (too many long quotes, an oversized image field) fails the
  whole write rather than shipping an oversized file. Trim content for that
  destination, not the budget.
- **Known gap in partial-run ranking**: when a `COUNTRIES`-scoped run
  refreshes only some countries, `mergeWorld` (in
  `pipeline/src/assemble/index.ts`) can't perfectly re-rank the combined
  global "emerging" list against untouched countries' existing entries,
  because the raw volume-weighted ranking score isn't persisted across runs
  — only `growthPct` survives, which is used as a coarse tie-breaker. A full
  run (all countries) always produces a correctly-ranked list; only partial
  runs have this rough edge. Flagged in the code as a Wave 2 follow-up, not
  yet fixed as of this writing.

If a run fails outright (non-zero exit), `data/` is untouched — `writeSnapshots`
validates and size-budgets every file before writing any of them, so a
mid-run failure never leaves a half-written snapshot set on disk. The
worst-case outcome of a failed run is stale data, not corrupted data.
