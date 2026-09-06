/**
 * Writes the fixture snapshot set into `data/`.
 *
 * The app always reads from `data/` — there is no separate fixture code path.
 * Wave 0 commits fixture data so every screen renders; the real pipeline
 * overwrites the same files once it runs.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFixtures } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', '..', 'data');

const { meta, world, countries, destinations } = generateFixtures();

rmSync(join(dataDir, 'country'), { recursive: true, force: true });
rmSync(join(dataDir, 'destination'), { recursive: true, force: true });
mkdirSync(join(dataDir, 'country'), { recursive: true });
mkdirSync(join(dataDir, 'destination'), { recursive: true });

const write = (rel: string, value: unknown) =>
  writeFileSync(join(dataDir, rel), JSON.stringify(value), 'utf8');

write('meta.json', meta);
write('world.json', world);
for (const c of countries) write(`country/${c.iso2}.json`, c);
for (const d of destinations) write(`destination/${d.slug}.json`, d);

console.log(
  `fixtures written: 1 meta, 1 world, ${countries.length} countries, ${destinations.length} destinations`,
);
