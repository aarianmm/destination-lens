# What the numbers do and do not mean

This is the honest account. Every claim below was checked against the code
that produces it, and most were measured live against the real APIs during
the build. Where a number in the app looks precise, read this first — several
of them are precise measurements of something other than what they look like
they're measuring.

## Flight flows are a route network, not passenger volumes

The arcs on the globe come from OpenFlights (`pipeline/src/flights/`), a
public, static, roughly **2014-era** dataset of scheduled airline routes. A
"flow" is a **count of distinct routes** between two countries' airports —
not a passenger count, not a live position feed, not anything from this
decade's air-travel reality. The code says this outright:

> "This is a route network, NOT passenger volume — the UI must never imply
> otherwise." — `pipeline/src/flights/index.ts`

Route counts favour **density of short-haul connections** over the size of a
long-haul tourism corridor. Measured against the actual generated flow file:
**GB→ES (Great Britain to Spain) is the single highest-weighted route in the
entire dataset** (weight 1.0, the normalisation ceiling) — a reflection of how
many separate short regional routes connect the two countries, not how many
Britons holiday in Spain versus anywhere else. Meanwhile **GB→TH doesn't
appear in the global top 200 routes at all**, despite being a well-known,
real tourism corridor — because it's served by comparatively few distinct
long-haul routes. If you're looking at the flow arcs expecting "biggest
tourist corridors", you are looking at the wrong data structure; it is
answering "which country pairs have the densest scheduled route network",
which is a different, related, but not interchangeable question.

## Social data is English-language only, and is a signal, not a survey

Every Bluesky search passes `lang=en` (`pipeline/src/bluesky/index.ts`). This
was not the original design — it was added after live sampling showed that,
without it, ordinary place names mostly surface **residents talking in their
own language about football, politics, and daily life**, not travellers. It
also means: this product cannot see non-English conversation at all. A
destination popular in French, Portuguese, Thai, or Japanese online
conversation is invisible to it. Read every mention count, sentiment, and
theme as "what English-language Bluesky said", never as "what people are
saying".

More broadly: even within English, Bluesky's user base is not representative
of travellers as a population. Treat everything downstream of it — themes,
sentiment, quotes, trend numbers — as **qualitative signal and directional
movement**, never as a statistically representative survey of travel opinion
or intent.

## Mention counts are contaminated by homonyms — and the mitigations are load-bearing, not decorative

This is the sharpest limitation in the system, and it was discovered by
building it, not anticipated in the plan.

- **"Koh Lanta"** — literally the flagship example destination in `idea.md` —
  collides hard with *Koh-Lanta*, a long-running French reality TV show
  (TF1). A live sample returned **~5,246 hits**, with roughly 8 of the top 10
  posts about the programme, not the island (commit `24bc72a`; guard list in
  `shared/vocab/TH.json`).
- **"Rio de Janeiro" and "Nairobi"** collide with character names from
  *Money Heist* (*La Casa de Papel*) — confirmed in the vocabulary's
  `negativeKeywords` for both (`shared/vocab/BR.json`, `shared/vocab/KE.json`),
  which explicitly list `"money heist"`, `"la casa de papel"`, `"netflix heist"`.
- **European city names were dropped from the curated country list partly
  because of this.** Live sampling of Madrid, Valencia, Barcelona, and
  Granada — each on 10,000+ raw hits — found travel-related content at **0%
  (Madrid, Valencia), 4% (Barcelona), 4% (Granada)**. The conversation was
  overwhelmingly La Liga football and Spanish politics. Spain, Portugal,
  Greece and Italy were replaced with Brazil, Peru, South Africa and Kenya as
  curated countries as a direct consequence (see "Coverage" below) — though
  they still legitimately appear in the *global flight-route* rankings, since
  that's independent of app-level "deep coverage".
- Other homonyms guarded in `shared/vocab/*.json` because they were caught the
  same way: Lima (the bean / Lima, Ohio / "Lima syndrome"), Salvador (El
  Salvador), Casablanca (the film), Fez (the hat), Kruger (Freddy Krueger),
  Durban (the cannabis strain "Durban Poison"), Pai (Pai Mei, "pai gow"), Nan
  (the bread, "my nan"), and several more.

**The mitigations, and why they only partly work:**

1. **`requireContext` + `negativeKeywords`** (per-destination, in
   `shared/vocab/{iso2}.json`): a guarded destination only counts a post if a
   travel keyword or the country name co-occurs, and any post containing a
   negative keyword is dropped outright regardless of context.
2. **A travel-context requirement applied to *every* destination, not just
   guarded ones** (`pipeline/src/bluesky/index.ts`, `hasTravelContext`): the
   original design only gated known homonyms, but the Madrid/Valencia finding
   showed the problem is general — ordinary place names are dominated by
   residents, not travellers. So every prefiltered post must now match a
   travel keyword or the country name.

Both mitigations are prefilter-stage rules, applied before the ~120-post
sample used for qualitative synthesis (blurb, themes, sentiment, quotes).
They **cannot fix a homonym nobody has noticed yet** — the guard list is
reactive, built from destinations someone actually sampled and found
contaminated. A newly-added destination with an unrecognised homonym problem
will silently produce noisy numbers until someone spots it.

## Weekly counts bypass the prefilter entirely — this matters more than it sounds

This is easy to miss: the 26-week trend series that drives every "emerging" /
"declining" / growth-percentage claim comes from Bluesky's **raw
`hitsTotal`** field on a `limit=1` search request per destination-week
(`pipeline/src/bluesky/index.ts`, `countWeek`). The keyword prefilter — the
travel-context requirement and the homonym guards described above — is only
ever applied to the ~120-post **qualitative sample** (the posts shown as
quotes, and fed to Gemini for themes/sentiment). It is never applied to the
counts themselves.

Practically: **the trend line and growth percentage for any destination
without a homonym problem are reasonably trustworthy as a directional
measure of "mentions of this exact search term or alias, in English, per
week."** For a destination *with* an unguarded homonym problem, the weekly
count is measuring whatever dominates that raw search — which the qualitative
sample would reveal (which is exactly how the Koh Lanta and Madrid problems
were found) but the number itself gives no warning sign. Guarded destinations
apply `requireContext`/`negativeKeywords` only in the qualitative prefilter,
not in the weekly-count query itself — so a guarded destination's *count*
still includes whatever the guard would have excluded from the sample. Treat
every trend number as measuring raw search-term volume, not verified
travel-relevant volume, and treat the guard list as protecting the qualitative
narrative (blurb, themes, quotes) more than the number itself.

## Known issue, unresolved as of this writing: some weekly counts came back zero on the first real run

This is current and unresolved, not a historical footnote — flag it as such
until someone closes it out.

The first real (non-fixture) pipeline run surfaced at least two problems in
the Bluesky collector, tracked on the `agent-g-pipeline` branch:

1. **A schema-validation bug that zeroed out an entire country.**
   `rawPostSchema.postedAt` requires a `Z`-suffixed UTC timestamp, but
   Bluesky's client-supplied `createdAt` isn't guaranteed to be Z-normalised
   — posts from Japanese clients in particular carried `+09:00`-style
   offsets, so every post failed validation and Japan collected zero
   mentions across the board despite the run exiting successfully. This was
   caught only because a country-wide zero is now treated as a fatal error
   rather than a quiet success (see "Bluesky's rate limiting" above), and has
   a fix (`normalizePostedAt`) on that branch.
2. **A second, still-open problem**: `hitsTotal` came back `0` for queries
   that should self-evidently have real volume — "Tokyo" included — on the
   authenticated (app-password) request path. A diagnostic script,
   `pipeline/src/bluesky/probe.ts`, was added specifically to isolate this
   (auth changing the response shape vs. `lang`+`since`/`until` intersecting
   to nothing vs. an error silently defaulting to zero) without guessing
   through repeated full pipeline runs. As of the latest commit on that
   branch, this was still being actively investigated, not confirmed fixed.

**What this means for any snapshot you're looking at:** a live run's
`weeklyMentions` array may legitimately contain zeros that are a collection
bug, not a real absence of conversation — most visibly the most recent
(current, still-open) week, which came back `0` in the first real run for
several destinations (Tokyo and Bangkok among them) while others in the same
run collected normal-looking volume. Until this is confirmed resolved,
**treat any single trailing zero, or any destination whose numbers look
implausibly low against its status, as a suspect data point first and a real
signal second** — check whether the same anomaly appears across unrelated
destinations in the same run (suggesting a systemic collection bug) or is
isolated to one place (more likely a real quiet week or a homonym-guard
effect). Depending on where the fix lands before the next real run, published
snapshots may carry weak or partial trend data for a period; this document
will be updated once the root cause is confirmed and closed.

## Traveller origin is inferred from explicit profile text, never guessed

`pipeline/src/enrich/origins.ts` maps a Bluesky author's own free-text profile
`location` field against a fixed table of regex patterns (city/country names)
to an ISO2 code. If a location string doesn't match anything in the table —
or if the profile has no location field at all, which is the common case —
that post contributes **no** origin signal. Nothing is inferred from a
person's name, language, timezone, or post content, and no LLM is ever asked
to guess. This keeps the "inferred from online conversation" label in the UI
literally true, but it also means: **origin figures reflect the minority of
posters who filled in a matching profile location, not the traveller
population, and not even the full posting population.** They are a garnish,
not a market-research panel.

## Bluesky's rate limiting is aggressive and shaped the whole collector design

Verified live, documented in `pipeline/src/bluesky/index.ts`:

- **`public.api.bsky.app` — the host named in the original plan — hard-403s
  every variant of `app.bsky.feed.searchPosts`**, including bare
  unauthenticated requests, while other read endpoints on the same host
  (`getProfile`, `searchActors`) return normal 200s. This looks like a
  deliberate block on full-text post search specifically, not an outage.
- The identical, unauthenticated request against **`api.bsky.app`** (no
  `public.` prefix) works — that's the default base URL now
  (`DEFAULT_BASE_URL`), overridable via `BSKY_APPVIEW_URL` since GitHub
  Actions' egress ranges might be treated differently than wherever this was
  built.
- Even on the working host, **gently-paced unauthenticated requests get
  blocked (403) after roughly 20 calls**, is why the collector falls back to
  minting a Bluesky app-password session (`BSKY_IDENTIFIER` /
  `BSKY_APP_PASSWORD`) on a 401/403, and why every response is cached to disk
  under `pipeline/cache/bluesky/` so re-runs don't re-spend the rate-limit
  budget on already-closed weeks.
- A request with no `User-Agent` header gets a separate, unrelated 403 from a
  WAF layer — the collector always sends a descriptive one.
- `hitsTotal` saturates at a flat **10,000** for very high-volume queries
  (an upstream cap) — harmless for the small/mid-volume destinations trend
  detection actually cares about, since anything hitting that ceiling would
  already read as `established`.

## "Emerging" is decided by arithmetic, with volume floors specifically to prevent noise

`pipeline/src/trends/index.ts` is pure maths — no LLM is ever asked whether a
destination "feels" trendy. For a destination's 26 weekly counts (oldest
first):

- `baseline` = mean of the first 22 weeks; `recent` = mean of the last 4.
- `growthPct = (recent − baseline) / max(baseline, 0.5)`, as a percentage,
  **clamped to −100..+400**.
- `zScore = (recent − baseline) / max(σ, 0.5)`, where σ is the baseline
  weeks' standard deviation.
- **`new`**: baseline < 1 and recent ≥ 8/week (checked *before* `emerging`,
  because a near-zero baseline makes the emerging growth/z conditions
  trivially true through the 0.5 floor — "went from nothing to something" is
  a more specific, more useful story than "grew 50%+").
- **`emerging`**: growth > 50% and z > 2 and recent ≥ 8/week.
- **`declining`**: growth < −35% and baseline ≥ 8/week.
- **`established`**: not decided by `classify()` alone — a second pass,
  `scoreCountry()`, computes each destination's recent-volume percentile
  *within its country* and promotes a top-quartile, otherwise-`quiet`
  destination to `established`.
- Everything else is **`quiet`** — the honest fallback when there isn't
  enough signal to say anything, not a euphemism for "boring".

The −100..+400 clamp exists because a near-zero baseline makes `growthPct`
arithmetically true but editorially useless: going from 3 mentions/week to 7
is a real +133%, but reporting it as such implies a scale of interest that
doesn't exist yet. The 8-mentions/week volume floors on `emerging` and
`declining` exist for the same reason, applied earlier in the pipeline. None
of these thresholds are tuned by a model, and none of them can be overridden
by one — the `classify()` module's own comment states this as a hard rule:
"the part of the product that decides what counts as 'emerging' ... must
never be a judgement call by a model."

The one place an LLM (Gemini Flash-Lite) is involved at all is downstream of
this decision: it classifies individual posts (relevant/sentiment/themes),
screens for toxic/spam/promotional content, and writes the blurb and theme
labels — and it is explicitly told the destination's already-decided status
and instructed not to contradict or re-justify it
(`pipeline/src/enrich/index.ts`, `buildSynthesisPrompt`).

## Coverage: which countries actually have deep intelligence

The curated country list has changed since `PLAN.md` was written. **Current**
(`pipeline/src/config.ts`, `ALL_COUNTRIES`): Thailand, Japan, Vietnam,
Indonesia, Mexico, Morocco, Brazil, Peru, South Africa, Kenya. The plan's
original list of Spain, Portugal, Greece, and Italy was dropped in favour of
Brazil, Peru, South Africa, and Kenya — driven by the homonym/travel-density
findings above, plus (per the swap's commit message) the European cluster
being "too small and crowded on the globe to click reliably." All ten
countries' vocabulary files (`shared/vocab/*.json`) are hand-curated and
Wikipedia-verified, 8–15 destinations each, with homonym guards added
per-destination as they were found. A country outside this list still shows
on the globe with real flight-route flows; it simply has no destination-level
panel, and the app says so rather than showing nothing or something
misleading.
