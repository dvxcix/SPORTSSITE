import { Tooltip } from '@/components/ui/tooltip-card'
import { BookLogo } from '@/components/BookLogo'

export const oStr = (v: number | null) => v == null ? '—' : (v > 0 ? `+${v}` : String(v))

// Small gold "📊 N picks" tag for a community Pikkit pick count — shared by
// Batter Cost and The Public so both stay in sync on how a pick count reads,
// rather than two copies drifting apart over time.
export function PickBadge({ picks, label }: { picks: number | null; label: string }) {
  if (picks == null) return null
  return (
    <Tooltip content={`${picks.toLocaleString()} community ${label} picks`}>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2, fontSize: 10, fontWeight: 800, color: 'var(--gold, #eab308)', cursor: 'help', lineHeight: 1 }}>
        📊{picks >= 1000 ? `${(picks / 1000).toFixed(1)}k` : picks}
      </div>
    </Tooltip>
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
