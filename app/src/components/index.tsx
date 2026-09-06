/**
 * Design-system barrel. Agents A and B import everything from here — keep
 * every export name and prop contract in `types.ts` stable even as the
 * implementations live in their own files.
 */
export { Panel } from './Panel.js';
export { StatusBadge } from './StatusBadge.js';
export { Sparkline } from './Sparkline.js';
export { StatDelta } from './StatDelta.js';
export { FlagChip } from './FlagChip.js';
export { QuoteCard } from './QuoteCard.js';
export { ImageCard } from './ImageCard.js';
export { Loading } from './Loading.js';
export { ErrorState } from './ErrorState.js';
