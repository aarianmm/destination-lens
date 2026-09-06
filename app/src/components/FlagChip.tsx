import type { FlagChipProps } from './types.js';

const BASIS_ICON: Record<NonNullable<FlagChipProps['basis']>, string> = {
  flights: '✈',
  social: '💬',
};
const BASIS_LABEL: Record<NonNullable<FlagChipProps['basis']>, string> = {
  flights: 'From the flight route network',
  social: 'Inferred from public posts',
};
const TREND_GLYPH: Record<NonNullable<FlagChipProps['trend']>, string> = {
  up: '↑',
  flat: '→',
  down: '↓',
};
const TREND_COLOR: Record<NonNullable<FlagChipProps['trend']>, string> = {
  up: 'var(--color-emerging)',
  flat: 'var(--color-ink-faint)',
  down: 'var(--color-declining)',
};

function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function FlagChip({ iso2, name, basis, trend }: FlagChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)]">
      <span className="text-base leading-none" aria-hidden>
        {flagEmoji(iso2)}
      </span>
      {name && <span className="text-[var(--color-ink)]">{name}</span>}
      {trend && (
        <span aria-hidden className="text-xs leading-none" style={{ color: TREND_COLOR[trend] }}>
          {TREND_GLYPH[trend]}
        </span>
      )}
      {basis && (
        // Honesty is a product requirement: the claim's basis is a visible label,
        // not just a hover tooltip, even if it is a quiet one.
        <span
          className="rounded-[3px] border border-[var(--color-hairline)] px-1 text-[9px] leading-[14px] tracking-wide text-[var(--color-ink-faint)] uppercase"
          title={BASIS_LABEL[basis]}
        >
          {BASIS_ICON[basis]} {basis}
        </span>
      )}
    </span>
  );
}
