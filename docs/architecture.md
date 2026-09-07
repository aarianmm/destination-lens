# Architecture

## Why there is no database or backend

Every piece of data the app shows changes at most once a day (a scheduled
pipeline run) and is small — the whole snapshot set is a few megabytes of
JSON across ten countries. That combination doesn't need a server: a batch
job can write static files, and a CDN can serve them. Cloudflare Workers here
is doing nothing but serving `app/dist` as static assets — see
`wrangler.jsonc`, which configures it as an `assets`-only Worker with
`not_found_handling: "single-page-application"` for client-side routing. There
is no compute happening per-request beyond that.

The tradeoff this buys: no database to run, back up, or secure; no API to
version; the entire "backend" is a GitHub Actions job and a directory of JSON.
The cost: data is only ever as fresh as the last successful pipeline run, and
a partial pipeline failure can leave `data/` stale rather than wrong (see
`docs/runbook.md` for how partial runs are handled).

## The data contract: `shared/src/schema.ts`

This file is the single source of truth for every JSON file under `data/`,
expressed as zod schemas. It is deliberately frozen — see `CLAUDE.md` rule 1 —
because it's the interface every other part of the system (pipeline stages,
the app, tests) is built against in parallel. The app never trusts a JSON file
just because it fetched successfully: `app/src/lib/snapshots.ts` runs every
response through the matching schema with `safeParse` before using it, so a
malformed pipeline output fails as a clear `SnapshotError`, not a rendering
crash three components downstream.

Four file shapes are published:

| File | Schema | Contains |
|---|---|---|
| `data/meta.json` | `metaSchema` | which countries have deep coverage, the 26 week-start dates every `weeklyMentions` array aligns to, and a human-readable `sources` note per data type |
| `data/world.json` | `worldSchema` | every country (`covered: boolean`), the global top ~200-300 flight routes, and the global top ~30 emerging destinations |
| `data/country/{iso2}.json` | `countrySchema` | one country's inbound flows and its destinations (status, growth, sparkline, top source markets) |
| `data/destination/{slug}.json` | `destinationSchema` | one destination's full profile: blurb, themes, sentiment, quotes, source markets, image |

Key conventions worth knowing when reading the code: `growthPct` is a
percentage, not a ratio (`84` means "+84%"); `weight` fields are normalised
0..1 *within their own list*, so a country's inbound-flow weights are not
comparable to the global flow weights; `weeklyMentions` is oldest-first and
index-aligned with `meta.weekStarts`. Every file has a byte-size budget
(`SIZE_BUDGETS` in the schema file — 300KB/150KB/60KB for world/country/
destination) enforced by the assembler before anything is written.

## Intermediate contracts: `shared/src/artifacts.ts`

Also frozen, for the same reason as the schema. These are the handoff shapes
*between pipeline stages* (not published to the app) — they're what let the
flights, Bluesky, and enrichment stages be built and tested independently.
Each stage reads/writes JSON under `pipeline/artifacts/` (gitignored,
regenerated every run):

```
vocab/{iso2}.json  (shared/vocab, hand-curated, committed) ─────────┐
flows.json          (flights stage, committed to a .generated.json) ┤
mentions/{slug}.json (bluesky stage: weekly counts + prefiltered posts) ┤──► assemble ──► data/*.json
trends.json          (trends stage: pure maths on mentions)          ┤
enrichment/{slug}.json (enrich stage: Gemini synthesis + origins)    ┘
```

- `VocabDestination` / `Vocab` — a destination's name, aliases, coordinates,
  Wikipedia title, and homonym guards (`requireContext`, `negativeKeywords`).
- `FlowsArtifact` — the global ranked route list plus each covered country's
  inbound breakdown.
- `MentionsArtifact` — 26 weekly counts plus a sample of prefiltered raw posts
  for one destination, and how many posts the prefilter discarded.
- `TrendResult` / `TrendsArtifact` — the output of the pure-maths trend
  classifier: status, growthPct, z-score, interest percentile.
- `PostClassification` / `Synthesis` / `EnrichmentArtifact` — Gemini's
  per-post relevance/sentiment/theme calls and the per-destination blurb/theme
  synthesis, plus inferred origin counts.

## Pipeline stage handoff

```
shared/vocab/{iso2}.json ──► pipeline/src/bluesky   ──► mentions/{slug}.json
pipeline/src/flights     ──► flows.generated.json (committed, rarely re-run)
mentions/{slug}.json     ──► pipeline/src/trends    ──► trends.json (pure maths, no LLM)
mentions + trends        ──► pipeline/src/enrich    ──► enrichment/{slug}.json (Gemini)
flows + trends + vocab + mentions + enrichment
                          ──► pipeline/src/assemble ──► data/*.json (zod-validated, size-budgeted)
```

Two things worth calling out because they're easy to miss reading the stages
in isolation:

- **Flights is not re-run per pipeline execution.** `pipeline/src/flights/run.ts`
  is a separate, manually-invoked script (`npm run flights -w @dl/pipeline`)
  that downloads OpenFlights data, aggregates it, and writes the result to
  both the gitignored artifacts directory *and* a committed file,
  `pipeline/src/flights/flows.generated.json`. Every regular pipeline run
  reads that committed file rather than hitting the network — this is what
  `PLAN.md` means by "rarely re-run". If you add a country, you must re-run
  this script (see `docs/runbook.md`).
- **A destination can be silently absent, on purpose.** `assemble()` skips a
  vocab destination entirely if the trends stage produced no result for it
  (`if (!trend) continue;` in `pipeline/src/assemble/index.ts`) rather than
  fabricating a status. `writeSnapshots()` similarly never deletes existing
  files for countries outside the current run's `COUNTRIES` filter, which is
  what makes a partial run (`COUNTRIES=TH,JP`) safe — see
  `mergeMeta`/`mergeWorld` in the same file.

## Poster-origin inference is a lookup table, not a model

`pipeline/src/enrich/origins.ts` maps a Bluesky author's free-text profile
`location` field against a fixed list of regexes to an ISO2 code. If nothing
matches, that post simply contributes no origin signal — it is never guessed
from name, language, or post content, and never passed to an LLM. This is
what lets the UI's "inferred from public profile locations" claim be literally
true rather than a euphemism.

## Trend status is arithmetic, computed in two passes

`pipeline/src/trends/index.ts` splits `classify()` (per-destination: baseline
mean, recent mean, z-score, and one of `new`/`emerging`/`declining`/`quiet`)
from `scoreCountry()` (across a country's destinations: interest percentile,
and promoting a top-quartile-volume `quiet` destination to `established`).
They're separate because a single destination's own weekly series can't tell
you how its volume ranks against its country's other destinations — see
`docs/data-and-limitations.md` for what these numbers do and don't mean.

## No database, so what's "state"?

`data/` itself is the only persistent state, and it's just files in git.
`pipeline/cache/` (raw upstream API responses) and `pipeline/artifacts/`
(intermediate stage JSON) are both gitignored and safe to delete — a stage
that finds no cache simply refetches. Nothing in the system depends on
in-memory state surviving between pipeline runs.
