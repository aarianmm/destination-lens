/**
 * AGENT F owns this module.
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

/** A model call: prompt in, raw text out. Swap for a fake in tests. */
export type LlmCaller = (prompt: string) => Promise<string>;

export type GeminiCallerOptions = {
  apiKey: string;
  /** e.g. `gemini-flash-lite-latest`. */
  model: string;
  /** Tried once if the primary model request fails, e.g. `gemini-2.5-flash-lite`. */
  fallbackModel?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
};

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type GeminiResponseBody = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

async function callGeminiModel(
  model: string,
  prompt: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string> {
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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${model} request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const body = (await res.json()) as GeminiResponseBody;
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new Error(`Gemini ${model} returned no text content`);
  return text;
}

/**
 * Real Gemini REST caller. Falls back to a secondary model once if the primary
 * request fails outright (model retired, region unavailable, etc.) — this is a
 * transport-level fallback, distinct from the JSON-validation retry in index.ts.
 */
export function createGeminiCaller(opts: GeminiCallerOptions): LlmCaller {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async (prompt: string) => {
    try {
      return await callGeminiModel(opts.model, prompt, opts.apiKey, fetchImpl);
    } catch (err) {
      if (!opts.fallbackModel) throw err;
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
