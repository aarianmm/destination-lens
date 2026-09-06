/**
 * THE GLOBE CONTRACT — frozen in Wave 0.
 *
 * Agent A replaces the stub implementation with the real three.js/globe.gl scene,
 * but must honour these props and this ref API exactly, because Agents B and C
 * build their screens against the stub before the real scene lands.
 *
 * Changes to this file go through the orchestrator, never a single agent.
 */
import type { DestinationStatus } from '@dl/shared';

export type ArcDatum = {
  /** Stable id, used for React keys and animation continuity. */
  id: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  /** 0..1 — drives stroke width, opacity and dash speed. */
  weight: number;
};

export type PointDatum = {
  /** Destination slug in country mode, iso2 in world mode. */
  id: string;
  lat: number;
  lng: number;
  label: string;
  status: DestinationStatus;
  /** 0..1 — drives radius. Derived from interestScore by the caller. */
  size: number;
};

export type CameraTarget = {
  lat: number;
  lng: number;
  /** globe.gl altitude units: ~2.5 is the whole world, ~0.6 frames a country. */
  altitude: number;
};

export type GlobeSceneHandle = {
  /** Smooth camera transition. `ms` is the flight duration. */
  flyTo: (target: CameraTarget, ms?: number) => void;
  /** Current camera position, for restoring on back-navigation. */
  getCamera: () => CameraTarget;
};

export type GlobeSceneProps = {
  mode: 'world' | 'country';
  /** Where the camera should sit. Undefined in world mode means "leave it alone". */
  focus?: CameraTarget;
  arcs: ArcDatum[];
  points: PointDatum[];
  /** Country to highlight (hover or current selection). */
  highlightedCountryIso2?: string | null;
  /** Countries with deep coverage — rendered as interactive, others are inert. */
  coveredIso2?: string[];
  onCountryClick?: (iso2: string) => void;
  onCountryHover?: (iso2: string | null) => void;
  onPointClick?: (id: string) => void;
  onPointHover?: (id: string | null) => void;
  /** Fires once the scene is interactive, so screens can fade in over it. */
  onReady?: () => void;
  /** Auto-rotate until the user interacts. Ignored under prefers-reduced-motion. */
  autoRotate?: boolean;
};
