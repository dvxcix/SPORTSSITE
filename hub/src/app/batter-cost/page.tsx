import { Suspense } from 'react'
import { BatterCostClient } from '@/components/batter-cost/BatterCostClient'
import Link from 'next/link'
import { TierGate } from '@/components/layout/TierGate'

export const revalidate = 0

// Deliberately not linked from the sidebar nav yet — same data source as
// Dugout (/api/dugout/data), just flattened across every game into one
// sortable list instead of grouped per-game. See BatterCostClient for the
// per-market delta computation.

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export default async function BatterCostPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const date = dateParam ?? today

  const stripDates = [-3, -2, -1, 0, 1, 2, 3].map(offset => {
    const d = offsetDate(date, offset)
    const dt = new Date(d + 'T12:00:00Z')
    return {
      date: d,
      isSelected: d === date,
      isToday: d === today,
      dayName: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayNum: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    }
  })

  const prevDate = offsetDate(date, -1)
  const nextDate = offsetDate(date, 1)

  return (
    <TierGate requiredTier="ultimate" label="Batter Cost">
    <div style={{ padding: '20px 16px' }}>
      {/* Header */}
      <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            Batter Cost
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', fontFamily: "'SF Mono',monospace", display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="live-dot" />
              OPENING VS NOW
            </span>
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Every batter on today&apos;s slate, ranked by how far each market has moved since the opening line
          </p>
        </div>
        <Link href="/dugout" style={{
          marginLeft: 'auto', padding: '7px 14px', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--text-2)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
        }}>
          ← Dugout
        </Link>
      </div>

      {/* Date strip */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden', marginBottom: 24,
      }}>
        <Link href={`/batter-cost?date=${prevDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
          borderRight: '1px solid var(--border)',
        }}>‹</Link>
        {stripDates.map(({ date: d, isSelected, isToday, dayName, dayNum }) => (
          <Link key={d} href={`/batter-cost?date=${d}`} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '10px 4px', textDecoration: 'none', gap: 3,
            background: isSelected ? 'var(--accent)' : 'transparent',
            borderRight: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--accent-fg)' : isToday ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {dayName}
            </span>
            <span style={{ fontSize: 12, fontWeight: isSelected || isToday ? 900 : 600, color: isSelected ? 'var(--accent-fg)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
              {dayNum}
            </span>
            {isToday && !isSelected && (
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
            )}
          </Link>
        ))}
        <Link href={`/batter-cost?date=${nextDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
        }}>›</Link>
      </div>

      {/* Client component (fetches own data) */}
      <Suspense fallback={null}>
        <BatterCostClient date={date} />
      </Suspense>
    </div>
    </TierGate>
  )
}
