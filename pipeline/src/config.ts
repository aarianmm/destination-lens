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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const countries = (env.COUNTRIES ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  return {
    countries: countries.length ? countries : [...ALL_COUNTRIES],
    dryRun: env.DRY_RUN === 'true' || env.DRY_RUN === '1',
    maxLlmCalls: Number(env.MAX_LLM_CALLS ?? 400),
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL ?? 'gemini-flash-lite-latest',
    bskyIdentifier: env.BSKY_IDENTIFIER,
    bskyAppPassword: env.BSKY_APP_PASSWORD,
  };
}
