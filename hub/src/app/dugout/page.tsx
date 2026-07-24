import { Suspense } from 'react'
import { DugoutClient } from '@/components/dugout/DugoutClient'
import Link from 'next/link'
import { TierGate } from '@/components/layout/TierGate'

export const revalidate = 0

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export default async function DugoutPage({
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
    <TierGate requiredTier="ultimate" label="The Dugout">
    <div style={{ padding: '20px 16px' }}>
      {/* Header */}
      <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <img src="/logo.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0, borderRadius: 8 }} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            The Dugout
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em', fontFamily: "'SF Mono',monospace", display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="live-dot" />
            </span>
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.06em',
              color: 'var(--accent-fg)', background: 'var(--accent)',
              padding: '2px 7px', borderRadius: 5,
            }}>
              ULTIMATE
            </span>
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Proprietary Game Matrix — Built for Game-By-Game Breakdown
          </p>
        </div>
        <Link href="/sports" style={{
          marginLeft: 'auto', padding: '7px 14px', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--text-2)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
        }}>
          ← Scores
        </Link>
      </div>

      {/* Date strip */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden', marginBottom: 24,
      }}>
        <Link href={`/dugout?date=${prevDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
          borderRight: '1px solid var(--border)',
        }}>‹</Link>
        {stripDates.map(({ date: d, isSelected, isToday, dayName, dayNum }) => (
          <Link key={d} href={`/dugout?date=${d}`} style={{
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
        <Link href={`/dugout?date=${nextDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
        }}>›</Link>
      </div>

      {/* Client component (fetches own data) */}
      <Suspense fallback={null}>
        <DugoutClient date={date} />
      </Suspense>
    </div>
    </TierGate>
  )
}
