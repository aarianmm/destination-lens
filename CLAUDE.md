# Destination Lens — working agreement

A visually-led travel discovery app: a 3D globe showing aggregated flight-route
flows, plus Bluesky-derived intelligence about which destinations are gaining
attention. Full plan in `PLAN.md`; product intent in `idea.md`.

## Shape of the thing

- `app/` — Vite + React + TS SPA. No server code. Reads static JSON from `/data`.
- `pipeline/` — Node + TS batch job, run by GitHub Actions. Writes `data/`.
- `shared/` — zod schemas (the data contract), fixture generator, curated vocab.
- `data/` — published snapshots. Currently fixture data; the pipeline overwrites it.

There is no database and no always-on backend. Everything the app renders is a
static file produced by a scheduled job.

## Rules that matter

1. **`shared/src/schema.ts` and `shared/src/artifacts.ts` are frozen.** They are the
   contract every parallel agent builds against. If you need a change, stop and ask
   the orchestrator — do not edit them yourself.
2. **`app/src/scene/types.ts` is frozen** for the same reason: screens are built
   against the GlobeScene stub before the real scene exists.
3. **Stay in your file-ownership zone.** Several agents work in parallel worktrees.
   Touching another agent's files causes merge conflicts that cost more than the
   change saved. If you need something outside your zone, ask.
4. **Trend decisions are maths, never LLM judgement.** The model classifies, clusters
   and phrases. It never decides what is "trending".
5. **Honesty in the UI is a product requirement, not a nicety.** Flight data is a
   route network, not passenger volumes. Social data is a signal, not a survey.
   Origin inference is explicitly labelled as inferred.
6. **Never commit secrets or raw scraped data.** Secrets come from the environment;
   `pipeline/cache/` and `pipeline/artifacts/` are gitignored.

## Working style

- **Commit often**, in small logical steps with clear messages. Do not save up one
  giant commit at the end.
- **Report back if you are unsure** rather than guessing — especially about the data
  contract, cross-agent surfaces, or anything that changes what the user sees.
- Write tests for logic with edge cases (trend maths, filters, parsing). Do not write
  tests for React rendering or for code that is obviously correct. Minimal but real.
- Match the surrounding code: comments explain _why_, not _what_.

## Commands

```bash
npm install          # once, at the root (npm workspaces)
npm run fixtures     # regenerate the fixture snapshot set into data/
npm run dev          # app on http://localhost:5173
npm run check        # typecheck + lint + test — run before you push
npm run build        # production build (also syncs data/ into app/public)
```
