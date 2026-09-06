# Destination Lens

A living map of global travel. An interactive 3D globe shows aggregated flight-route
flows between countries; underneath, a batch pipeline reads public Bluesky
conversation to work out which destinations inside a country are gaining attention,
why, and where the interest is coming from.

> Status: MVP in active development. `data/` currently holds generated fixture data,
> clearly marked as such in `meta.json`.

## Quick start

```bash
npm install
npm run fixtures
npm run dev
```

## How it works

```
GitHub Actions (daily)              Cloudflare Workers
  OpenFlights  → route flows          app/ (static SPA)
  Bluesky      → weekly mentions  →   fetches /data/*.json
  prefilter    → Gemini classify      react-globe.gl scene
  trend maths  → emerging ranking
  assemble     → data/*.json (committed → triggers redeploy)
```

No database, no always-on backend: every screen renders from static JSON snapshots.

## What the numbers do and do not mean

- Flight flows come from the OpenFlights **route network**. They describe which
  city pairs are connected, not how many people fly.
- "Emerging" is decided by arithmetic on weekly mention counts — baseline, growth and
  a z-score with volume floors — never by asking a model what feels trendy.
- Social conversation is a **signal**, not a survey. Traveller-origin figures are
  inferred and labelled as such; they are not the nationality mix of actual visitors.

See `PLAN.md` for the full implementation plan and `CLAUDE.md` for the working
agreement between contributors.
