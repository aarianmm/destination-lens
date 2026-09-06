/**
 * THE DESIGN-SYSTEM CONTRACT — frozen in Wave 0.
 *
 * Agent C implements and styles these; Agents A and B import them immediately.
 * Props may be ADDED (optional only) by Agent C, never removed or renamed.
 */
import type { DestinationStatus } from '@dl/shared';
import type { ReactNode } from 'react';

export type PanelProps = {
  children: ReactNode;
  className?: string;
  /** Panels float over the globe, so they are translucent by default. */
  solid?: boolean;
  /** Adds hover/focus affordance for panels that act as clickable rows/cards. */
  interactive?: boolean;
};

export type StatusBadgeProps = {
  status: DestinationStatus;
  /** Compact form for dense list rows. */
  size?: 'sm' | 'md';
};

export type SparklineProps = {
  /** Oldest first. Usually 26 weekly values. */
  values: number[];
  /** Accent colour; defaults to the status colour when `status` is given. */
  status?: DestinationStatus;
  width?: number;
  height?: number;
  /** Week-start dates aligned to `values`, for hover readouts. */
  labels?: string[];
};

export type StatDeltaProps = {
  /** Percentage: 84 renders as +84%. */
  growthPct: number;
  /** Suppress the number when it would be misleading (near-zero baseline). */
  status?: DestinationStatus;
  size?: 'sm' | 'md' | 'lg';
};

export type FlagChipProps = {
  iso2: string;
  name?: string;
  /** Where the claim comes from — rendered as a tooltip/label, never hidden. */
  basis?: 'flights' | 'social';
  trend?: 'up' | 'flat' | 'down';
};

export type QuoteCardProps = {
  text: string;
  url: string;
  postedAt: string;
};

export type ImageCardProps = {
  /** Undefined is expected and normal: many destinations have no lead image. */
  image?: { url: string; attribution: string; sourceUrl: string };
  /** Used to derive a deterministic gradient when there is no image. */
  seed: string;
  alt: string;
  className?: string;
  children?: ReactNode;
};

export type LoadingProps = { label?: string };
export type ErrorStateProps = { message: string; onRetry?: () => void };
