import { Tooltip } from '@/components/ui/tooltip-card'
import { BookLogo } from '@/components/BookLogo'
import { publicCountDeltaText, publicCountText, type MlbPublicMovement } from '@/lib/mlbPublicMovement'

export const oStr = (v: number | null) => v == null ? '—' : (v > 0 ? `+${v}` : String(v))

// Small gold "📊 N picks" tag for a community Pikkit pick count — shared by
// Batter Cost and The Public so both stay in sync on how a pick count reads,
// rather than two copies drifting apart over time.
export function PickBadge({ picks, label, movement, compact = false }: { picks: number | null; label: string; movement?: MlbPublicMovement | null; compact?: boolean }) {
  if (picks == null) return null
  const delta = movement?.delta ?? null
  return (
    <div aria-label={`${picks.toLocaleString('en-US')} community ${label} picks; ${delta == null ? 'change unavailable' : `${delta > 0 ? '+' : ''}${delta} since previous capture`}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 2, fontSize: compact ? 8 : 10, fontWeight: 800, color: 'var(--gold, #eab308)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
      <span>{compact ? 'P ' : '📊'}{publicCountText(picks)}</span>
      <span style={{ color: delta == null || delta === 0 ? 'var(--text-3)' : delta > 0 ? 'var(--accent)' : '#f87171', whiteSpace: 'nowrap', fontFamily: compact ? 'ui-monospace, SFMono-Regular, Consolas, monospace' : undefined }}>{publicCountDeltaText(delta, compact)}</span>
    </div>
  )
}

// Centered row of book-logo + raw American-odds badges for one market's raw
// per-book prices object (e.g. props.sa) — shared by Batter Cost and The
// Public. A fixed 2-column grid (not flex-wrap) so row height stays
// predictable regardless of container width — flex-wrap's line count
// depends on the container's actual rendered width, so the same cell could
// wrap differently at different viewport widths.
export function BookBadges({ prices, books }: { prices: any; books: string[] }) {
  const entries = books.map(b => [b, prices?.[b]] as const).filter((e): e is [string, number] => e[1] != null)
  if (!entries.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', justifyContent: 'center', columnGap: 6, rowGap: 1, marginTop: 3 }}>
      {entries.map(([book, v]) => (
        <Tooltip key={book} content={book}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>
            <BookLogo vendor={book} size={13} />{oStr(v)}
          </span>
        </Tooltip>
      ))}
    </div>
  )
}
