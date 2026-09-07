/**
 * Real-run bug fix (Agent G, Wave 2): the first live run against a freshly
 * provisioned Gemini key fired 300+ calls back to back with no spacing and hit
 * a per-minute rate limit almost immediately. Every 429 was treated as a hard
 * failure, and the (then-current) fallback model was itself retired, so ~45%
 * of classification batches were silently lost. These tests pin the fix:
 * retry-with-backoff on 429/503 for the SAME model, and only fall back to a
 * different model for a non-retryable failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiCaller } from '../src/enrich/gemini.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Advances fake timers far enough to flush every `sleep()`-based backoff the
 * caller schedules, so the test doesn't cost real wall-clock seconds. */
async function callAndFlush(caller: (prompt: string) => Promise<string>): Promise<string> {
  const result = caller('prompt');
  result.catch(() => {}); // mark handled now; the real assertion reads `result` below
  await vi.advanceTimersByTimeAsync(120_000);
  return result;
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

function geminiOk(text: string) {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });
}

describe('createGeminiCaller — rate-limit backoff', () => {
  it('retries a 429 on the SAME model and succeeds without ever touching the fallback', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, { status: 429 }))
      .mockResolvedValueOnce(geminiOk('{"ok":true}'));

    const caller = createGeminiCaller({
      apiKey: 'test-key',
      model: 'primary-model',
      fallbackModel: 'fallback-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await callAndFlush(caller);
    expect(result).toBe('{"ok":true}');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Both calls went to the primary model — the fallback was never needed.
    for (const call of fetchImpl.mock.calls) {
      expect(String(call[0])).toContain('primary-model');
    }
  });

  it('falls back to the secondary model for a non-retryable failure (e.g. a retired model)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, { status: 404 }))
      .mockResolvedValueOnce(geminiOk('{"ok":true}'));

    const caller = createGeminiCaller({
      apiKey: 'test-key',
      model: 'retired-model',
      fallbackModel: 'fallback-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await callAndFlush(caller);
    expect(result).toBe('{"ok":true}');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('retired-model');
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('fallback-model');
  });

  it('throws if the SAME model keeps rate-limiting past the retry budget', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'still limited' }, { status: 429 }));

    const caller = createGeminiCaller({
      apiKey: 'test-key',
      model: 'primary-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(callAndFlush(caller)).rejects.toThrow(/request failed: 429/);
  });
});
