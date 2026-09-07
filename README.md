# Destination Lens

A travel-discovery app built around an interactive 3D globe. It shows aggregated
flight-route flows between countries, and — for ten curated countries — which
destinations inside them are getting more or less attention in public Bluesky
conversation, why, and where the interest seems to be coming from.

Live: **https://destination-lens.amalhotrawk.workers.dev**

There is no database and no always-on backend. A scheduled batch job writes
static JSON files to `data/`; the app is a static single-page app that reads
them. Redeploying is just committing new JSON.

Before trusting any number this app shows you, read
[`docs/data-and-limitations.md`](docs/data-and-limitations.md). Short version:
flight lines are a route network, not passenger counts; the social signal is
English-language Bluesky only; and "emerging" is a threshold on arithmetic, not
a model's opinion.

## Screens

- **Explore** (`/`) — the world globe. Route flows as arcs, curated countries
  highlighted, a rail of currently-emerging destinations.
- **Country** (`/c/:iso2`) — inbound flows into one country, plus its
  destinations ranked and status-badged (established / emerging / declining /
  new / quiet). Countries outside the curated ten still show flows, with an
  honest "deep coverage coming soon" panel instead of fabricated destinations.
- **Destination** (`/d/:slug`) — one destination's profile: growth sparkline,
  themes, sentiment, representative quotes (linked back to the source post),
  source markets, and a methodology footnote repeating the caveats above.
- **Discover** (`/discover`) — a ranked grid of emerging destinations across
  all covered countries.

## Running it locally

Requires Node 22+.

```bash
npm install       # once, at the repo root — this is an npm workspaces monorepo
npm run fixtures  # generate a fake-but-realistic snapshot set into data/
npm run dev       # app at http://localhost:5173
```

`npm run fixtures` is what makes local development possible without any
secrets or API calls — it writes the same JSON shapes the real pipeline
produces, just invented. The app cannot tell the difference; `data/meta.json`
labels fixture data as fixture data (`"sources": {"flights": "FIXTURE DATA — ..."}`)
so nobody mistakes it for real numbers.

Other useful commands:

```bash
npm run check   # typecheck + lint + test — run before pushing
npm run build   # production build; also copies data/ into app/public
```

## How the pieces fit together

```
GitHub Actions (cron + workflow_dispatch)         Cloudflare Workers
┌───────────────────────────────────┐            ┌───────────────────────┐
│ pipeline/  (Node + TS batch job)   │  commits   │ app/  (Vite React SPA)│
│  flights   OpenFlights → routes    │  data/ to  │  fetches /data/*.json │
│  bluesky   collector + prefilter   │  main ───► │  react-globe.gl scene │
│  trends    weekly counts → status  │ (triggers  │  4 routes, no server  │
│  enrich    Gemini classify+blurb   │  redeploy) │  code                 │
│  assemble  validate + write data/  │            └───────────────────────┘
└───────────────────────────────────┘
```

- `app/` — Vite + React + TypeScript SPA. No server code, reads static JSON
  from `/data`.
- `pipeline/` — Node + TS batch job, normally run by GitHub Actions. Writes
  `data/`.
- `shared/` — the zod schemas that are the data contract between the two,
  the fixture generator, and the curated per-country vocabulary
  (`shared/vocab/*.json`).
- `data/` — the published snapshots the app actually reads. Committed to the
  repo; overwritten by pipeline runs.

## Running the pipeline for real

The pipeline runs via GitHub Actions (`.github/workflows/pipeline.yml`), on a
daily cron and on manual `workflow_dispatch`. It needs these repo secrets:

- **`CLOUDFLARE_API_TOKEN`** / **`CLOUDFLARE_ACCOUNT_ID`** — for deploys
  (`deploy.yml`). Create the token from the Cloudflare dashboard using the
  **"Edit Cloudflare Workers"** template; the account ID is on any Worker's
  overview page.
- **`GEMINI_API_KEY`** — for post classification and destination blurbs/themes
  (Google AI Studio).
- **`BSKY_IDENTIFIER`** / **`BSKY_APP_PASSWORD`** — a Bluesky handle and an
  app password (Settings → App Passwords in the Bluesky app, not your real
  password). Bluesky's unauthenticated search rate limit is aggressive enough
  that a real run needs these as a fallback.

To rehearse a run without spending any API budget: trigger `pipeline.yml`
manually with the `countries` input set to a short list (e.g. `TH,JP`) and
`dryRun` checked — it does everything (vocabulary, flight flows, Bluesky
collection, trend maths) except call Gemini or write `data/`. `MAX_LLM_CALLS`
(default 400) caps real Gemini spend per run; exceeding it aborts the run
loudly rather than overspending silently.

## Status

MVP under active build. `data/` currently holds pipeline-generated fixture
data (see the `sources` field in `data/meta.json` to check which). Full
end-to-end wiring of the real pipeline is in review — see open PRs before
assuming a scheduled run has ever produced real snapshots, and see
[`docs/data-and-limitations.md`](docs/data-and-limitations.md) for a known
issue with the first real run's weekly counts.

## Further reading

- [`PLAN.md`](PLAN.md) — the original implementation plan. Mostly followed;
  the curated country list changed (Spain/Portugal/Greece/Italy swapped for
  Brazil/Peru/South Africa/Kenya — see the limitations doc for why).
- [`idea.md`](idea.md) — the original product brief.
- [`CLAUDE.md`](CLAUDE.md) — the working agreement between contributors.
- [`docs/data-and-limitations.md`](docs/data-and-limitations.md) — what the
  numbers do and do not mean. Read this one.
