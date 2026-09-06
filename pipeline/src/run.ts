/**
 * Pipeline entry point. Wiring is finalised by Agent G in Wave 2; until then each
 * stage is runnable on its own and this orchestration will fail fast on the first
 * unimplemented module, which is the intended Wave 1 behaviour.
 */
import { loadConfig } from './config.js';
import { log } from './lib/log.js';

async function main() {
  const config = loadConfig();
  log.step('run', `countries=${config.countries.join(',')} dryRun=${config.dryRun}`);
  log.step('run', 'stage wiring lands with Agent G (Wave 2)');
  throw new Error('full pipeline run not wired yet — run individual stages');
}

main().catch((err: unknown) => {
  log.error('run', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
