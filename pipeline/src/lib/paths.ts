import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, '..', '..', '..');
export const DATA_DIR = join(REPO_ROOT, 'data');
export const VOCAB_DIR = join(REPO_ROOT, 'shared', 'vocab');
/** Gitignored: intermediate stage output, safe to delete. */
export const ARTIFACTS_DIR = join(REPO_ROOT, 'pipeline', 'artifacts');
/** Gitignored: raw upstream responses, so re-runs are cheap. */
export const CACHE_DIR = join(REPO_ROOT, 'pipeline', 'cache');

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function ensureParent(filePath: string): string {
  mkdirSync(dirname(filePath), { recursive: true });
  return filePath;
}
