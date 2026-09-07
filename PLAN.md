# Destination Lens — MVP Implementation Plan

**Goal:** a visually striking travel-discovery web app centred on an interactive 3D globe, combining aggregated flight-route flows with Bluesky-derived "emerging destination" intelligence, per `idea.md`.

**Execution model:** an Opus orchestrator coordinates Sonnet subagents working concurrently in git worktrees, each shipping a PR. Three parallel waves + a punch-list wave, with human visual checkpoints between waves using Cloudflare preview deploys.

---

## 1. Settled scope decisions

| Decision      | Choice                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data realness | Real batch pipeline; scheduled CI job publishes **static JSON snapshots**; no always-on backend, no database                                                               |
| Stack         | **Vite + React + TypeScript SPA** served as static assets on **Cloudflare Workers**; three.js via **globe.gl / react-globe.gl**                                            |
| Coverage      | Global flows for whole world; deep intelligence for **~10 curated countries**; graceful "coverage coming" state elsewhere                                                  |
| Social source | **Bluesky only** (its search API supports historical queries → solves trend baseline cold-start)                                                                           |
| Flight data   | **OpenFlights routes/airports datasets** (free, static) aggregated into country→country and country→city flows                                                             |
| LLM           | Cheap keyword prefilter → **Gemini Flash-Lite** (`gemini-flash-lite-latest`, fall back to `gemini-2.5-flash-lite`) for relevance/sentiment/theme classification and blurbs |
| Screens       | All four: Explore, Country, Destination, **Discover**                                                                                                                      |
| Repo/CI       | New GitHub repo created during execution; GitHub Actions for CI + pipeline; Cloudflare deploys with per-PR preview URLs                                                    |

### Deliberate changes vs `idea.md` (flagged and agreed)

1. **4chan is cut.** Noisy, poor origin signal, brand-risky for a premium consumer product. Bluesky is the sole MVP source; Mastodon is post-MVP.
2. **Flight flows come from the OpenFlights route network, not ADS-B.** OpenSky gives live aircraft _positions_, not origin→destination flows; deriving flows from positions is a project in itself. OpenFlights gives exactly the aggregated routes the doc prefers. Known limitation: the dataset is stale (~2014) — the _shape_ of the global network is fine for visuals, but the UI must label it "route network", never live volumes.
3. **Source markets are primarily flight-derived.** Social-post origin inference is weak signal; where shown it is a clearly-labelled "inferred from online conversation" garnish, per the idea doc's own caveat.
4. **Trend baseline is backfilled, not accumulated.** The pipeline queries Bluesky historically (26 weeks of weekly mention counts per destination) at run time, so "↑ 84%" is real from day one rather than fabricated or waiting months for history.
5. **Destination vocabulary is hand-curated for MVP** (~10–15 destinations per country with aliases and homonym guards). Automatic discovery of brand-new destination names is a stretch task (Wave 2, Agent J), not a dependency.

---

## 2. Architecture

```
GitHub Actions (cron daily + manual)                Cloudflare Workers
┌─────────────────────────────────┐                ┌──────────────────────┐
│ pipeline/ (Node + TS)           │   commits      │ app/ (Vite SPA,      │
│  flights → flows                │   data/ to     │ static assets)       │
│  bluesky → weekly counts, posts │   main ──────► │ fetches /data/*.json │
│  prefilter → gemini classify    │   (triggers    │ react-globe.gl scene │
│  trends → rank → blurbs         │    redeploy)   │ 4 routes             │
│  assemble + zod-validate        │                └──────────────────────┘
└─────────────────────────────────┘
```

### Repo layout (npm workspaces monorepo)

```
destination-lens/
├── app/                    # Vite React SPA
│   ├── src/
│   │   ├── scene/          # GlobeScene + layers (Agent A owns)
│   │   ├── screens/        # explore/ country/ destination/ discover/
│   │   ├── components/     # design system: Panel, Badge, Sparkline, FlagChip, StatDelta…
│   │   ├── lib/            # snapshot loading, formatting, router
│   │   └── styles/         # tokens, global CSS (Tailwind v4)
│   └── public/data/        # symlink/copy of /data at build time
├── pipeline/
│   └── src/
│       ├── flights/        # OpenFlights → flows (Agent D)
│       ├── bluesky/        # collector + prefilter (Agent E)
│       ├── trends/         # weekly series → status/growth (Agent E)
│       ├── enrich/         # Gemini classify + blurbs (Agent F)
│       ├── assemble/       # snapshot writer + validation (Agent F)
│       └── cache/          # raw pulls cached as artifacts (gitignored)
├── shared/
│   ├── src/schema.ts       # zod schemas = THE data contract (Wave 0, frozen)
│   ├── src/fixtures.ts     # realistic fake snapshot generator
│   └── vocab/              # per-country destination seed files (Agent D)
├── data/                   # published snapshots (committed by pipeline)
├── .github/workflows/      # ci.yml, deploy.yml, pipeline.yml
└── wrangler.jsonc          # Workers static assets config
```

Anyone can develop the frontend against `shared/fixtures.ts` output before the real pipeline exists — this is what makes the waves parallel.

---

## 3. Data contracts (defined and frozen in Wave 0)

Zod schemas in `shared/src/schema.ts`; sketches below. Every pipeline run must validate before committing. Size budgets: `world.json` ≤ 300 KB, each country ≤ 150 KB, each destination ≤ 60 KB.

```ts
// data/meta.json
{ generatedAt: string, schemaVersion: 1, countries: string[] /* covered iso2 */ }

// data/world.json
{
  countries: [{ iso2, name, lat, lng, covered: boolean }],
  flows: [{ fromIso2, toIso2, weight /* 0–1 normalised */ }],   // top ~200 routes
  emerging: [{ slug, name, countryIso2, lat, lng, growthPct, rank }]  // global top ~30
}

// data/country/{iso2}.json
{
  iso2, name, centroid: {lat,lng}, bounds,
  inboundFlows: [{ fromIso2, weight }],                          // top ~15
  destinations: [{
    slug, name, lat, lng,
    status: 'established'|'emerging'|'declining'|'new'|'quiet',
    interestScore /* 0–100 percentile within country */,
    growthPct, weeklyMentions: number[] /* trailing 26 wks */,
    topSourceMarkets: [{ iso2, basis: 'flights'|'social' }]
  }]
}

// data/destination/{slug}.json
{
  slug, name, countryIso2, lat, lng, status, growthPct, interestScore,
  weeklyMentions: number[],
  blurb: string,                       // Gemini, ≤2 sentences, factual tone
  themes: [{ emoji, label, weight }],  // ≤6
  sentiment: {
    positive: string[], negative: string[],       // ≤3 short paraphrases each
    quotes: [{ text, url, postedAt }]             // ≤4 representative, linked
  },
  sourceMarkets: [{ iso2, trend: 'up'|'flat'|'down', basis }],
  image?: { url, attribution, sourceUrl }         // Wikipedia lead image
}
```

**GlobeScene component contract** (stub in Wave 0 so Agents B/C can consume before A finishes):

```ts
<GlobeScene
  mode="world" | "country"
  focus?: { lat, lng, altitude }            // camera target when mode=country
  arcs: ArcDatum[]  points: PointDatum[]
  onCountryClick={(iso2) => …}  onPointClick={(slug) => …}
/>
// + ref with flyTo(target, ms) for smooth transitions
```

---

## 4. Pipeline design

Runs in GitHub Actions (cron: daily 03:00 UTC + `workflow_dispatch` with a `countries` filter for cheap partial runs). Steps:

1. **Flights (rarely re-run):** parse OpenFlights `airports.dat` + `routes.dat` → map airports to countries/cities → aggregate route counts into country→country flows and inbound flows per covered country → normalise weights. Cached output committed once; only re-run manually.
2. **Vocabulary:** load `shared/vocab/{iso2}.json` — per destination: `name, aliases[], lat/lng, wikipediaTitle, requireContext?: boolean` (homonym guard: e.g. "Nice", "Split", "Phuket" is safe; guarded names only count when a travel keyword or the country name co-occurs).
3. **Bluesky collector:** for each destination, query the public AppView `app.bsky.feed.searchPosts` (unauthenticated; fall back to an app-password session if rate limits force it) with `since`/`until` windows → weekly mention counts for trailing 26 weeks (counts only, cheap) + full text of the most recent ~120 posts (for qualitative analysis). Exponential backoff; raw pulls cached to `pipeline/cache/` and uploaded as a workflow artifact so re-runs are cheap.
4. **Keyword prefilter:** drop non-travel posts (spam, sports teams, unrelated homonyms) via rule list before any LLM call. Target: ≥60% of posts filtered here.
5. **Gemini enrichment (Flash-Lite):** batch 20 posts/call, strict JSON output, zod-validated with one retry then skip. Per post: `relevant: bool, sentiment: pos|neg|neutral, themes: string[]`. Per destination (one call): synthesise `themes[] (emoji+label), positive[], negative[], blurb`, given the classified posts + trend numbers. Budget guard: hard cap (default 400 calls/run) → fail loudly, never overspend. Origin garnish: infer poster origin only from explicit profile location strings via lookup table (no LLM guessing).
6. **Trend detection (pure maths, no LLM):** for weekly counts `w`, baseline = mean(weeks −26..−5), recent = mean(weeks −4..−1), σ = std of baseline weeks.
   - `growthPct = (recent − baseline) / max(baseline, 0.5)`
   - `z = (recent − baseline) / max(σ, 0.5)`
   - **emerging:** growth > 0.5 ∧ z > 2 ∧ recent ≥ 8 mentions/wk · **new:** baseline < 1 ∧ recent ≥ 8 · **declining:** growth < −0.35 ∧ baseline ≥ 8 · **established:** top-quartile volume, stable · else **quiet**. Volume floors prevent 3-mentions→7-mentions "+133%" junk.
   - `interestScore` = percentile of recent volume within the country. Global emerging rank = z-score weighted by log(volume).
7. **Imagery:** Wikipedia REST summary endpoint per `wikipediaTitle` → lead image URL + attribution; omit gracefully if none (app renders a gradient card).
8. **Assemble:** write all snapshot files, zod-validate, enforce size budgets, write `meta.json`, open a PR (or push to `main` on scheduled runs) → redeploy.

**Curated countries (10):** Thailand, Japan, Vietnam, Indonesia, Mexico, Morocco, Brazil, Peru, South Africa, Kenya. Pilot pair for validation: **Thailand + Japan**.

> Changed during execution. The original list included Spain, Portugal, Greece and Italy. They were dropped for two measured reasons: on the globe, small clustered European countries made poor click targets, and in the data, European city names carried almost no travel signal — sampling live posts gave a travel-related share of 0% for Madrid and Valencia and 4% for Barcelona and Granada, against 10,000+ hits each, because the conversation is residents discussing football and politics. The replacements are larger, further apart, and cleaner in the data.

---

## 5. Frontend design

**Routes:** `/` Explore · `/c/:iso2` Country · `/d/:slug` Destination · `/discover` Discover. React Router; screen state (selected country, hovered point) in a small Zustand store; snapshots fetched lazily per route and cached.

**Visual direction:** near-black background (#050810-ish) with subtle starfield; night-lights or dark-styled earth texture; arcs as animated dashed gradients (origin colour → warm destination glow); emerging destinations pulse amber/coral; established points cool white; typography: a display serif for headings (Google Fonts, e.g. Instrument Serif) + Inter for UI; minimal chrome — the globe is the hero. Framer Motion for panel/page transitions; globe camera transitions via `flyTo` easing.

**Screen behaviours:**

- **Explore:** full-bleed globe, slow auto-rotate until first interaction; top ~150 arcs animated; emerging hotspots glow; hover country → highlight + name; slim header (wordmark, Discover link, "data updated {date}"); a compact "🔥 Emerging now" side rail (top 5, click-through). Click country → camera flies in → `/c/:iso2`.
- **Country:** globe pinned to country at an angle; inbound arcs remain; destination points sized by interestScore, coloured by status; right-hand panel: country name, "who's coming here" flag row, destination list rows (name, status badge, sparkline, growth %). Uncovered country → panel with flows only + "Deep coverage coming soon". Click destination → `/d/:slug`.
- **Destination:** overlay panel (globe stays dimmed behind): hero image w/ attribution, status badge + growth headline, 26-week sparkline, "Why it's gaining attention" themes chips, "What travellers are saying" quotes (linked to Bluesky), source-market flags with basis labels ("flight network" / "inferred from posts"), Gemini blurb, methodology footnote ("signals from public online conversation — not a survey").
- **Discover:** ranked card grid of global emerging destinations (image, country, growth, blurb); click-through to destination view.

**Performance guardrails:** cap 150 arcs / 300 points rendered; low-poly globe with 2k textures (4k only if fps allows); no post-processing in MVP; degrade arc animation on `prefers-reduced-motion`; target 60fps on an M-series laptop, usable on mid-range hardware.

---

## 6. CI/CD & environments

- **`ci.yml`** (every PR + main): install → typecheck → lint → `vitest` (pipeline unit tests: trend maths, prefilter, schema fixtures) → `vite build` with fixture data.
- **`deploy.yml`**: on `main` → `wrangler deploy` (production). On PRs → `wrangler versions upload` → post the preview URL as a PR comment. **Preview URLs are the human visual-judging surface.**
- **`pipeline.yml`**: cron daily + manual dispatch (with country filter + `dryRun`) → run pipeline → validate → commit `data/` to main → redeploy.
- **Secrets (human provides once, at Checkpoint A):** `GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Optional later: `BSKY_IDENTIFIER`/`BSKY_APP_PASSWORD` if unauthenticated rate limits bite.
- Repo created under the user's GitHub account via `gh repo create` during Wave 0; `main` branch protected only by CI passing (keep scrappy).

---

## 7. Orchestration: waves, agents, checkpoints

Principles: the orchestrator (Opus) does Wave 0 itself, then spawns Sonnet agents in isolated worktrees (`isolation: "worktree"`), one PR per agent, merging in dependency order and resolving conflicts. Parallelism is safe because (a) the schema + fixtures are frozen in Wave 0, (b) each agent has an exclusive file-ownership zone, (c) shared surfaces (GlobeScene API, intermediate pipeline artifact shapes) are stubbed contracts from Wave 0. Agents must not edit `shared/src/schema.ts`; contract-change requests go to the orchestrator.

### Wave 0 — Foundations (orchestrator, sequential, ~1 session)

Scaffold monorepo (npm workspaces, TS strict, ESLint+Prettier, Vitest); Vite app with router, 4 placeholder screens, dark shell, design tokens; `shared` package: **full zod schemas + fixture generator producing a complete realistic fake snapshot set** (Thailand + Japan + world, plausible numbers); GlobeScene stub component honouring the contract (renders a flat placeholder); pipeline package skeleton with typed module boundaries; workflows (`ci`, `deploy`); `git init`, GitHub repo, Cloudflare Workers project, first deploy of the shell.

> **✅ Checkpoint A (human):** repo exists, CI green, dark app shell live on a Cloudflare URL, schema + fixture data reviewed. Human adds the three secrets. _Gate: nothing in Wave 1 starts until schema is approved — it's the contract everyone builds against._

### Wave 1 — Parallel build (6 Sonnet agents, worktrees, one PR each)

| Agent                                     | Scope (exclusive file zone)                                                 | Acceptance criteria                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Globe scene & Explore**             | `app/src/scene/**`, `app/src/screens/explore/**`                            | Real GlobeScene implementing the Wave-0 contract: textured earth, animated arcs, glowing status-coloured points, hover highlight, country click, `flyTo` camera, auto-rotate. Explore screen fully assembled on fixture data at 60fps with 150 arcs.                                                             |
| **B — Country & Destination screens**     | `app/src/screens/country/**`, `app/src/screens/destination/**`              | Both screens complete against the GlobeScene _stub_ + fixtures: country panel with destination rows/sparklines/badges, uncovered-country state, destination overlay with all profile sections, back-navigation.                                                                                                  |
| **C — Design system, shell & Discover**   | `app/src/components/**`, `app/src/styles/**`, `app/src/screens/discover/**` | Polished shared components (Panel, Badge, Sparkline, FlagChip, StatDelta, QuoteCard, ImageCard w/ gradient fallback), header/nav, loading + error states, Discover grid on fixtures. B imports these; C publishes early drafts within 1 day to unblock B (orchestrator sequences the merge C→B).                 |
| **D — Data foundations: flights + vocab** | `pipeline/src/flights/**`, `shared/vocab/**`                                | OpenFlights parsing → validated `world.json` flows + inbound flows for all 10 countries; hand-curated vocab files (10–15 destinations each, aliases, coords, wikipediaTitle, homonym guards) — may use Gemini to draft, must hand-verify coords/names. Unit tests on aggregation.                                |
| **E — Bluesky collector + trends**        | `pipeline/src/bluesky/**`, `pipeline/src/trends/**`                         | Historical weekly counts + recent-post collection with backoff/caching; keyword prefilter; trend maths per §4.6 with unit tests on synthetic series (spike, flat, decline, tiny-volume cases). Demonstrated live against Thailand vocab (D publishes Thailand's vocab file within 1 day; E stubs it until then). |
| **F — Gemini enrichment + assembler**     | `pipeline/src/enrich/**`, `pipeline/src/assemble/**`                        | Batched Flash-Lite classification + per-destination synthesis with strict-JSON validation, retry, budget guard; assembler produces the full snapshot set from _fixture intermediate artifacts_ (shapes frozen in Wave 0), zod-validated, size-budgeted. Wikipedia imagery fetch.                                 |

Merge order: D, E, F (pipeline, low conflict) and C → B → A (app; A merges last as it replaces the stub). Orchestrator runs a smoke pass after each merge.

> **✅ Checkpoint B (human):** walk the preview deploy — globe wow-factor judged, all four screens on fixture data; orchestrator runs the real pipeline end-to-end for **Thailand + Japan** and posts sample output for sanity review (are the emerging calls believable? quotes appropriate?). Punch list captured as issues.

### Wave 2 — Integration & polish (4 Sonnet agents)

| Agent                                     | Scope                                             | Acceptance criteria                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G — Full-data integration**             | pipeline glue, `pipeline.yml`, `data/`            | Real pipeline runs for all 10 countries within rate/budget limits; real snapshots wired into the app (fixtures kept behind a `?fixtures` flag for dev); schema mismatches fixed; scheduled workflow live. |
| **H — Visual polish & performance**       | app-wide (coordinates with orchestrator on files) | Checkpoint-B punch list; motion polish; responsive layout (globe-behind-sheet on mobile portrait); reduced-motion support; fps guardrails verified; empty/slow-network states.                            |
| **I — Content quality & trust**           | `pipeline/src/enrich`, destination screen copy    | Blurb/theme prompt tuning on real data; quote selection quality (no toxic/spam quotes — add a screening rule to the Gemini pass); methodology footnotes; attribution correctness for images and quotes.   |
| **J — Stretch (only if B went smoothly)** | `pipeline/src/discovery/**`                       | Entity-extraction pass over country-level travel posts proposing _new_ destination names → flagged `new`, human-reviewable list appended to vocab via PR. Cut without ceremony if time is short.          |

> **✅ Checkpoint C (human):** full walkthrough of production deploy with real data for all 10 countries. Go/no-go punch list.

### Wave 3 — Ship (orchestrator + at most 1 agent)

Punch-list fixes only, README (setup, secrets, pipeline runbook, known limitations), final Lighthouse/fps sanity pass, tag `v0.1.0`.

---

## 8. Risks & mitigations

| Risk                                   | Mitigation                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bluesky rate limits / API instability  | Counts-only queries for baselines (cheap); cache raw pulls as artifacts; backoff; optional authenticated session; country filter for partial runs |
| Homonym destinations ("Nice", "Split") | `requireContext` vocab flag + prefilter co-occurrence rules; unit tests with known false-positive posts                                           |
| Low volume for small destinations      | Volume floors in trend rules; widen window to 8 weeks for low-volume places; show "quiet — not enough signal" honestly instead of noise           |
| OpenFlights staleness                  | Label as "route network"; never claim passenger volumes; post-MVP swap-in point isolated in `pipeline/src/flights`                                |
| Gemini JSON drift / cost overrun       | Strict zod validation + 1 retry + skip; hard call-cap per run fails loudly                                                                        |
| Globe performance                      | Arc/point caps, 2k textures, no post-processing, fps check in Checkpoints B & C                                                                   |
| Parallel-agent merge conflicts         | Exclusive file zones, frozen contracts, stubs for shared surfaces, orchestrator-mediated contract changes, defined merge order                    |
| Snapshot repo bloat                    | Size budgets enforced by assembler; raw data never committed (cache is gitignored/artifacts)                                                      |

## 9. Out of scope (post-MVP)

Mastodon/other sources; live flight overlays; automatic vocabulary discovery at scale (J is a taste); user accounts, saving, sharing; search; i18n; official tourism-statistics validation layer; accommodation/search-trend data; SSR/OG images (would motivate the Next.js/OpenNext revisit).
