/**
 * AGENT G (Wave 2) glue: loads and validates per-country vocabulary files from
 * `shared/vocab/{iso2}.json`.
 *
 * A missing or malformed vocab file degrades that one COUNTRY out of the run
 * rather than failing the whole pipeline — e.g. a country whose vocab another
 * agent hasn't landed yet, or a hand-edit typo. `run.ts` fails loudly only if
 * this leaves zero usable countries for the whole run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vocabSchema, type Vocab } from '@dl/shared';
import { VOCAB_DIR } from './paths.js';
import { log } from './log.js';

export function loadVocab(iso2: string): Vocab | undefined {
  const path = join(VOCAB_DIR, `${iso2}.json`);
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = vocabSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      log.warn(
        'vocab',
        `${iso2}.json failed schema validation, skipping this country: ` +
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
      return undefined;
    }
    return parsed.data;
  } catch (err) {
    log.warn(
      'vocab',
      `could not load vocab for ${iso2} (${path}), skipping this country: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return undefined;
  }
}
