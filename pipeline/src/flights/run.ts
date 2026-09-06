/**
 * CLI entry point for the flights stage: `npm run flights -w @dl/pipeline`.
 *
 * Rarely re-run — the flow network is committed once. Writes the validated artifact
 * to the gitignored `pipeline/artifacts/flows.json` (for the assembler to read) AND to
 * the committed `pipeline/src/flights/flows.generated.json`, which lets the rest of the
 * pipeline run without network access after this stage has been run once.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowsArtifactSchema } from '@dl/shared';
import { ALL_COUNTRIES } from '../config.js';
import { writeJson } from '../lib/json.js';
import { log } from '../lib/log.js';
import { ARTIFACTS_DIR } from '../lib/paths.js';
import { buildFlows } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const GENERATED_PATH = join(here, 'flows.generated.json');

async function main() {
  const artifact = await buildFlows({ countries: [...ALL_COUNTRIES] });

  const artifactsPath = join(ARTIFACTS_DIR, 'flows.json');
  writeJson(artifactsPath, flowsArtifactSchema, artifact);
  log.step('flights', `wrote ${artifactsPath}`);

  const serialised = JSON.stringify(artifact, null, 2);
  writeFileSync(GENERATED_PATH, serialised, 'utf8');
  const sizeKb = (Buffer.byteLength(serialised, 'utf8') / 1024).toFixed(1);
  log.step('flights', `wrote ${GENERATED_PATH} (${sizeKb} KB)`);

  log.step(
    'flights',
    `top flow: ${artifact.flows[0]?.fromIso2} -> ${artifact.flows[0]?.toIso2} (weight ${artifact.flows[0]?.weight})`,
  );
}

main().catch((err: unknown) => {
  log.error('flights', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
