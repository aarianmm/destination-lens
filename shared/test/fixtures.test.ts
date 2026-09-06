/**
 * Guards the frozen contract itself: if fixtures stop matching the schema, or the
 * cross-references between snapshots break, every agent building against them is
 * silently building against a lie.
 */
import { describe, expect, it } from 'vitest';
import { generateFixtures } from '../src/fixtures/index.js';
import {
  SIZE_BUDGETS,
  countrySchema,
  destinationSchema,
  metaSchema,
  worldSchema,
} from '../src/schema.js';

const fixtures = generateFixtures();

describe('fixture snapshot set', () => {
  it('validates against the frozen schema', () => {
    expect(() => metaSchema.parse(fixtures.meta)).not.toThrow();
    expect(() => worldSchema.parse(fixtures.world)).not.toThrow();
    for (const c of fixtures.countries) expect(() => countrySchema.parse(c)).not.toThrow();
    for (const d of fixtures.destinations) expect(() => destinationSchema.parse(d)).not.toThrow();
  });

  it('is deterministic for a fixed date', () => {
    const a = JSON.stringify(generateFixtures(new Date('2026-09-06T03:00:00.000Z')));
    const b = JSON.stringify(generateFixtures(new Date('2026-09-06T03:00:00.000Z')));
    expect(a).toBe(b);
  });

  it('has no dangling cross-references between snapshots', () => {
    const destinationSlugs = new Set(fixtures.destinations.map((d) => d.slug));
    const countryCodes = new Set(fixtures.countries.map((c) => c.iso2));

    for (const e of fixtures.world.emerging) {
      expect(destinationSlugs.has(e.slug), `world.emerging -> ${e.slug}`).toBe(true);
    }
    for (const c of fixtures.countries) {
      for (const d of c.destinations) {
        expect(destinationSlugs.has(d.slug), `${c.iso2} -> ${d.slug}`).toBe(true);
      }
    }
    for (const d of fixtures.destinations) {
      expect(countryCodes.has(d.countryIso2), `${d.slug} -> ${d.countryIso2}`).toBe(true);
    }
    // Covered countries in meta must each have a snapshot to load.
    for (const iso2 of fixtures.meta.countries) {
      expect(countryCodes.has(iso2), `meta.countries -> ${iso2}`).toBe(true);
    }
  });

  it('flow endpoints all resolve to a country with coordinates', () => {
    const known = new Set(fixtures.world.countries.map((c) => c.iso2));
    for (const f of fixtures.world.flows) {
      expect(known.has(f.fromIso2), `flow from ${f.fromIso2}`).toBe(true);
      expect(known.has(f.toIso2), `flow to ${f.toIso2}`).toBe(true);
      expect(f.fromIso2).not.toBe(f.toIso2);
    }
  });

  it('stays inside the published size budgets', () => {
    const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');
    expect(bytes(fixtures.world)).toBeLessThanOrEqual(SIZE_BUDGETS.world);
    for (const c of fixtures.countries) expect(bytes(c)).toBeLessThanOrEqual(SIZE_BUDGETS.country);
    for (const d of fixtures.destinations) {
      expect(bytes(d), d.slug).toBeLessThanOrEqual(SIZE_BUDGETS.destination);
    }
  });

  it('never reports a growth figure that would be editorially meaningless', () => {
    // A near-zero baseline can produce arithmetically true but absurd percentages.
    for (const d of fixtures.destinations) {
      expect(d.growthPct, d.slug).toBeLessThanOrEqual(400);
      expect(d.growthPct, d.slug).toBeGreaterThanOrEqual(-100);
    }
  });

  it('only calls a destination emerging when recent volume clears the noise floor', () => {
    for (const d of fixtures.destinations) {
      if (d.status !== 'emerging' && d.status !== 'new') continue;
      const recent = d.weeklyMentions.slice(-4).reduce((a, b) => a + b, 0) / 4;
      expect(recent, `${d.slug} recent weekly mentions`).toBeGreaterThanOrEqual(8);
    }
  });
});
