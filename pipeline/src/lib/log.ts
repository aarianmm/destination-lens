/** Boring structured-ish logging. CI reads this, so keep lines greppable. */
const started = Date.now();
const stamp = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;

export const log = {
  step: (stage: string, message: string) => console.log(`[${stamp()}] [${stage}] ${message}`),
  warn: (stage: string, message: string) => console.warn(`[${stamp()}] [${stage}] WARN ${message}`),
  error: (stage: string, message: string) =>
    console.error(`[${stamp()}] [${stage}] ERROR ${message}`),
};
