/** Copies the published snapshots in /data into app/public/data so Vite serves them. */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'data');
const dest = join(here, '..', 'public', 'data');

if (!existsSync(src)) {
  console.error('No /data directory. Run `npm run fixtures` first.');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('synced /data -> app/public/data');
