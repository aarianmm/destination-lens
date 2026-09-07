/**
 * AGENT F owns this module. Amended by Agent G (Wave 2) after the first real
 * run — see the notes on `callGeminiModel` and `createGeminiCaller` below.
 *
 * Thin wrapper over the Gemini `generateContent` REST API. Deliberately dumb: it
 * takes a prompt, returns raw text, and knows nothing about JSON schemas or
 * classification — that lives in `index.ts`, which depends on the `LlmCaller`
 * function type rather than this module directly.
 *
 * There is no Gemini API key at build time (it arrives at Checkpoint A), so the
 * only thing that can be verified today is that the request/response shape
 * matches the documented API. Once the key exists, wiring a real run is a config
 * change (construct this caller from `PipelineConfig` and pass it in) — nothing
 * in `index.ts` needs to change, because it only ever depends on `LlmCaller`.
 */
import { log } from '../lib/log.js';

/** A model call: prompt in, raw text out. Swap for a fake in tests. */
export type LlmCaller = (prompt: string) => Promise<string>;

export type GeminiCallerOptions = {
  apiKey: string;
  /** e.g. `gemini-flash-lite-latest`. */
  model: string;
  /** Tried once if the primary model request fails outright (e.g. retired). */
  fallbackModel?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
};

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Verified live on the first real run: 300+ calls fired back to back with no
 * artificial spacing burned through a per-minute quota almost immediately, and
 * every 429 was being treated as a hard failure — one retry (`index.ts`'s own
 * JSON-shape retry, which re-fires instantly) wasn't enough for a quota that
 * needs real wall-clock time to refill. Back off and retry ON THE SAME MODEL
 * for 429/503 specifically, the same way `bluesky/index.ts` already does for
 * its own rate limits.
 */
const MAX_RATE_LIMIT_RETRIES = 4;
const INITIAL_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type GeminiResponseBody = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

async function callGeminiModel(
  model: string,
  prompt: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const res = await fetchImpl(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          // Ask nicely for strict JSON; index.ts still validates and retries, since
          // models drift from this regardless of what's requested.
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    });

    if (res.ok) {
      const body = (await res.json()) as GeminiResponseBody;
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
      if (!text) throw new Error(`Gemini ${model} returned no text content`);
      return text;
    }

    const bodyText = await res.text().catch(() => '');
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const backoffMs = Number.isFinite(retryAfterMs)
        ? retryAfterMs
        : INITIAL_BACKOFF_MS * 2 ** attempt;
      log.warn(
        'enrich',
        `Gemini ${model} ${res.status}, backing off ${Math.round(backoffMs)}ms (attempt ${attempt + 1})`,
      );
      await sleep(backoffMs);
      continue;
    }
    throw new Error(`Gemini ${model} request failed: ${res.status} ${bodyText.slice(0, 300)}`);
  }
  // Unreachable: every loop iteration above either returns or throws. Present
  // only so TypeScript can see every path returns/throws.
  throw new Error(`Gemini ${model}: exhausted rate-limit retries`);
}

/**
 * Real Gemini REST caller. Falls back to a secondary model once if the primary
 * request fails outright (model retired, region unavailable, etc. — NOT a rate
 * limit, which `callGeminiModel` already retries on the same model) — this is a
 * transport-level fallback, distinct from the JSON-validation retry in index.ts.
 */
export function createGeminiCaller(opts: GeminiCallerOptions): LlmCaller {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async (prompt: string) => {
    try {
      return await callGeminiModel(opts.model, prompt, opts.apiKey, fetchImpl);
    } catch (err) {
      if (!opts.fallbackModel) throw err;
      log.warn(
        'enrich',
        `primary model ${opts.model} failed (${describeError(err)}), trying fallback ${opts.fallbackModel}`,
      );
      return await callGeminiModel(opts.fallbackModel, prompt, opts.apiKey, fetchImpl);
    }
  };
}

/** Strips ```json ... ``` / ``` ... ``` fences models love to add despite instructions. */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1]! : trimmed).trim();
}
