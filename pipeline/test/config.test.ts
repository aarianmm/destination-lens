import { describe, expect, it } from 'vitest';
import { ALL_COUNTRIES, loadConfig } from '../src/config.js';

// GitHub Actions `workflow_dispatch` inputs with no value arrive as an empty
// string env var, not an absent one — a naive `?? fallback` doesn't catch that
// (`"" ?? x` is `""`). This pins the fix: a blank env var must behave exactly
// like an absent one for every optional field.
describe('loadConfig — blank env vars behave like absent ones', () => {
  it('falls back to the default budget when MAX_LLM_CALLS is blank', () => {
    expect(loadConfig({ MAX_LLM_CALLS: '' }).maxLlmCalls).toBe(400);
  });

  it('uses MAX_LLM_CALLS when it is a real number', () => {
    expect(loadConfig({ MAX_LLM_CALLS: '50' }).maxLlmCalls).toBe(50);
  });

  it('falls back to the default budget for a non-numeric or non-positive override', () => {
    expect(loadConfig({ MAX_LLM_CALLS: 'nonsense' }).maxLlmCalls).toBe(400);
    expect(loadConfig({ MAX_LLM_CALLS: '0' }).maxLlmCalls).toBe(400);
    expect(loadConfig({ MAX_LLM_CALLS: '-5' }).maxLlmCalls).toBe(400);
  });

  it('treats a blank GEMINI_API_KEY as undefined, not an empty string', () => {
    expect(loadConfig({ GEMINI_API_KEY: '' }).geminiApiKey).toBeUndefined();
    expect(loadConfig({ GEMINI_API_KEY: 'real-key' }).geminiApiKey).toBe('real-key');
  });

  it('treats blank Bluesky credentials as undefined', () => {
    const config = loadConfig({ BSKY_IDENTIFIER: '', BSKY_APP_PASSWORD: '' });
    expect(config.bskyIdentifier).toBeUndefined();
    expect(config.bskyAppPassword).toBeUndefined();
  });

  it('falls back to all covered countries when COUNTRIES is blank', () => {
    expect(loadConfig({ COUNTRIES: '' }).countries).toEqual([...ALL_COUNTRIES]);
  });

  it('parses a comma-separated COUNTRIES override, uppercased and trimmed', () => {
    expect(loadConfig({ COUNTRIES: ' th, jp ' }).countries).toEqual(['TH', 'JP']);
  });
});
