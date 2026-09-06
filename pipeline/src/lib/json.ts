import { readFileSync, writeFileSync } from 'node:fs';
import type { ZodType } from 'zod';
import { ensureParent } from './paths.js';

/** Read + validate in one step. A malformed artifact should fail here, loudly. */
export function readJson<T>(path: string, schema: ZodType<T>): T {
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `${path} failed validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}

export function writeJson<T>(path: string, schema: ZodType<T>, value: unknown): T {
  const parsed = schema.parse(value);
  writeFileSync(ensureParent(path), JSON.stringify(parsed), 'utf8');
  return parsed;
}
