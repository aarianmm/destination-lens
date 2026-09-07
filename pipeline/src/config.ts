/**
 * Pipeline configuration. Secrets come from the environment only — never committed.
 */
export type PipelineConfig = {
  /** Restrict the run to these iso2 codes. Empty = all covered countries. */
  countries: string[];
  /** Do everything except write snapshots and call paid APIs. */
  dryRun: boolean;
  /** Hard ceiling on Gemini calls per run. Exceeding it aborts loudly. */
  maxLlmCalls: number;
  geminiApiKey: string | undefined;
  geminiModel: string;
  /** Optional Bluesky credentials, used only if unauthenticated limits bite. */
  bskyIdentifier: string | undefined;
  bskyAppPassword: string | undefined;
};

export const ALL_COUNTRIES = ['TH', 'JP', 'VN', 'ID', 'MX', 'MA', 'BR', 'PE', 'ZA', 'KE'] as const;

/**
 * `workflow_dispatch` inputs with no value are still passed through as an empty
 * string, not omitted — GitHub Actions has no concept of "unset" env var here.
 * `?? fallback` alone doesn't catch that (`"" ?? x` is `""`, not `x`), so every
 * optional env var is normalised through this first.
 */
function undefinedIfBlank(value: string | undefined): string | undefined {
  return value && value.trim() !== '' ? value : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const countries = (env.COUNTRIES ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const maxLlmCallsRaw = undefinedIfBlank(env.MAX_LLM_CALLS);
  const maxLlmCalls = maxLlmCallsRaw ? Number(maxLlmCallsRaw) : 400;

  return {
    countries: countries.length ? countries : [...ALL_COUNTRIES],
    dryRun: env.DRY_RUN === 'true' || env.DRY_RUN === '1',
    maxLlmCalls: Number.isFinite(maxLlmCalls) && maxLlmCalls > 0 ? maxLlmCalls : 400,
    geminiApiKey: undefinedIfBlank(env.GEMINI_API_KEY),
    geminiModel: undefinedIfBlank(env.GEMINI_MODEL) ?? 'gemini-flash-lite-latest',
    bskyIdentifier: undefinedIfBlank(env.BSKY_IDENTIFIER),
    bskyAppPassword: undefinedIfBlank(env.BSKY_APP_PASSWORD),
  };
}
