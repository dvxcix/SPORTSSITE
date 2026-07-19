import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SlateBreakdownClient } from '@/components/slate/SlateBreakdownClient'
import { TierGate } from '@/components/layout/TierGate'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'Slate Breakdown — SlipSurge',
}

// Deliberately not linked from Sidebar nav yet — internal-only data
// scratchpad, same pattern as /players/[id]. Combines Dugout's schedule/
// lineup data (no odds — that's Dugout's own thing) with the full pitch-
// log-driven matchup exploration built for the player pages: pick a game,
// see both starters' recency-selectable stat line + zone profile, and
// every opposing batter's form specifically against the pitch mix that
// starter actually throws.
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export default async function SlateBreakdownPage({
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
    <TierGate requiredTier="advanced" label="Slate Breakdown">
    <div style={{ padding: '20px 16px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            Slate Breakdown
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Every starter&apos;s pitch mix, every batter&apos;s form against it — fully automatic
          </p>
        </div>
      </div>

      {/* Date strip — identical pattern to /dugout's, server-rendered links so dates stay shareable */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden', marginBottom: 24,
      }}>
        <Link href={`/slate-breakdown?date=${prevDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
          borderRight: '1px solid var(--border)',
        }}>‹</Link>
        {stripDates.map(({ date: d, isSelected, isToday, dayName, dayNum }) => (
          <Link key={d} href={`/slate-breakdown?date=${d}`} style={{
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
        <Link href={`/slate-breakdown?date=${nextDate}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, flexShrink: 0, textDecoration: 'none',
          color: 'var(--text-3)', fontSize: 18, fontWeight: 700,
        }}>›</Link>
      </div>

      <Suspense fallback={null}>
        <SlateBreakdownClient date={date} />
      </Suspense>
    </div>
    </TierGate>
  )
}
