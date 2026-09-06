/**
 * AGENT D owns this module.
 *
 * Turns the OpenFlights `airports.dat` + `routes.dat` datasets into an aggregated
 * route-network flow graph. This is a route network, NOT passenger volume — the UI
 * must never imply otherwise.
 */
import type { FlowsArtifact } from '@dl/shared';

export type BuildFlowsOptions = {
  /** iso2 codes needing per-country inbound breakdowns. */
  countries: string[];
  /** Cap on globally-returned flows before normalisation. */
  maxFlows?: number;
};

export async function buildFlows(_options: BuildFlowsOptions): Promise<FlowsArtifact> {
  throw new Error('buildFlows not implemented — Agent D');
}
