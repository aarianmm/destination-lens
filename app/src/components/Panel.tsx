import type { PanelProps } from './types.js';

/**
 * The base glass surface used throughout the app. Panels float over the globe,
 * so translucency + blur is the default; `solid` opts into a fully opaque
 * surface for places that need to fully occlude the scene behind them.
 */
export function Panel({ children, className = '', solid, interactive }: PanelProps) {
  return (
    <div
      className={`relative rounded-[var(--radius-panel)] border border-[var(--color-hairline)] shadow-[var(--shadow-panel)] ${
        solid ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-surface)]/75 backdrop-blur-xl'
      } ${
        interactive
          ? 'cursor-pointer transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-[var(--color-ink-faint)] hover:shadow-[var(--shadow-panel-hover)] motion-reduce:transition-none motion-reduce:hover:translate-y-0'
          : ''
      } ${className}`}
    >
      {/* A hairline top highlight is what reads as "glass" rather than "flat grey box". */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[var(--radius-panel)] bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      {children}
    </div>
  );
}
