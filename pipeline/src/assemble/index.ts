/**
 * AGENT F owns this module.
 *
 * Combines every stage artifact into the published snapshot set, validates against
 * the frozen schema, enforces size budgets, and writes `data/`.
 */
import type {
  Country,
  Destination,
  EnrichmentArtifact,
  FlowsArtifact,
  Meta,
  TrendsArtifact,
  Vocab,
  World,
} from '@dl/shared';

export type AssembleInput = {
  flows: FlowsArtifact;
  trends: TrendsArtifact;
  vocabs: Vocab[];
  enrichment: Map<string, EnrichmentArtifact>;
  weekStarts: string[];
  generatedAt: string;
};

export type AssembleOutput = {
  meta: Meta;
  world: World;
  countries: Country[];
  destinations: Destination[];
};

export function assemble(_input: AssembleInput): AssembleOutput {
  throw new Error('assemble not implemented — Agent F');
}

/** Writes the snapshot set to `data/`, failing if any file exceeds its size budget. */
export function writeSnapshots(_output: AssembleOutput): void {
  throw new Error('writeSnapshots not implemented — Agent F');
}
