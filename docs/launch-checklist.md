# MVP launch checklist

Where things stand, and what the next full pipeline run does automatically.

## What the next run flushes out by itself

The app detects sample data rather than being told about it, so these clear on
their own the moment real data lands. Nothing here needs a code change at launch.

| Sample artefact | How it's detected | Clears when |
|---|---|---|
| "partly sample data" chip in the header | `meta.sources.social` contains "fixture" | the pipeline rewrites `meta.json` |
| Inert quote cards reading "Sample quote — not a real post" | quote URL contains `fixture.example` | real quotes replace them |
| Flag-and-name placeholder instead of a photo | image URL is a `data:` URI, or absent | Wikipedia images are fetched |
| Stale destination/country snapshots from an older coverage set | not referenced by any country snapshot | `writeSnapshots` prunes them |

Fixtures no longer generate images at all. A fake photograph with a fake
attribution line was worse than no photograph, so the placeholder is now the
honest no-photo state.

## Before launch

1. **Run the pipeline across all countries.** `gh workflow run pipeline.yml`
   with no country filter covers everything in `ALL_COUNTRIES`. A partial run
   leaves the countries it skipped on sample data.
2. **Check the Gemini fix actually works.** The retired fallback model and the
   missing 429 backoff cost 24 of 29 destinations their blurbs on the first real
   run. The fix is committed but has never been exercised against live traffic.
   Watch the run log for `WARN` lines from the enrich stage, and confirm the
   proportion of destinations with a non-empty `blurb`.
3. **Confirm the header chip has gone.** If it is still showing, some country
   did not get real data.
4. **Read a few destination pages.** Blurbs should be specific and traceable to
   the quotes beneath them. Generic travel-brochure phrasing means the prompt
   grounding is not holding.

## Known gaps at launch

- **Image attribution is legally insufficient.** `pipeline/src/enrich/wikipedia.ts`
  emits `Photo via Wikipedia — "{title}"` with no photographer or licence.
  Wikimedia Commons requires both (e.g. "Ninara, CC BY 2.0"). This matters if the
  site is public. Small fix, not yet done.
- **Mobile is unsupported.** Usable but unpolished below roughly 768px.
- **Weekly counts are unfiltered.** They come from the search's raw `hitsTotal`;
  the keyword prefilter only shapes the qualitative sample. See
  `data-and-limitations.md`.
- **Source-market trend arrows** reflect the destination's overall direction, not
  per-market movement.
- The globe bundle is ~1.79MB (506KB gzipped). See `../TBD.md`.

## Deliberately removed

`pipeline/src/tools/repair-partial-week.ts` was a one-off that recomputed trends
after the in-progress-week bug. That bug is fixed at source in
`pipeline/src/lib/weeks.ts`, and running the repair on correct data would now
discard a genuine week. Recover it from git history if it is ever needed again.
