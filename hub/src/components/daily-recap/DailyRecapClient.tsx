'use client'

import { useEffect, useState } from 'react'
import { DailyRecapTable } from '@/components/dugout/DugoutClient'

function todayEt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function addDays(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

const navBtnStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
}

// Same data source and rendering as The Dugout — this page just fetches the
// same /api/dugout/data response and hands it to DailyRecapTable, which
// runs the exact same buildBatterRow/Paper/MM pipeline as the live board,
// flattened to confirmed HR hitters only. See DugoutClient.tsx for the
// shared rendering itself.
export function DailyRecapClient() {
  const [date, setDate] = useState(todayEt)
  const [data, setData] = useState<any | null>(null)
  const [error, setError] = useState('')
  const isToday = date === todayEt()

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError('Failed to load this date.') })
    return () => { cancelled = true }
  }, [date])

  // Same soft-refresh-in-place as DugoutClient's own listener — Custom
  // Matrix is a per-account resource, not page-scoped, so a Matrix saved
  // from here or from The Dugout applies to both; this just means editing
  // one while looking at today's real home runs updates the highlights
  // here without a manual reload, exactly like on the live board.
  useEffect(() => {
    const onMatricesUpdated = () => {
      fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(d => setData(d))
        .catch(() => {})
    }
    window.addEventListener('ss:matrices-updated', onMatricesUpdated)
    return () => window.removeEventListener('ss:matrices-updated', onMatricesUpdated)
  }, [date])

  // Today's confirmed-HR feed changes throughout the games. Keep the recap
  // current in place instead of freezing the row count at the first page load.
  useEffect(() => {
    if (!isToday) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(d => setData(d))
        .catch(() => {})
    }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [date, isToday])

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-2.5 sm:p-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <button onClick={() => setDate(d => addDays(d, -1))} style={navBtnStyle}>←</button>
          <input
            type="date" value={date} max={todayEt()}
            onChange={e => e.target.value && setDate(e.target.value)}
            style={{ ...navBtnStyle, fontWeight: 700, cursor: 'pointer' }}
          />
          <button onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} style={{ ...navBtnStyle, opacity: isToday ? 0.4 : 1 }}>→</button>
          {!isToday && <button onClick={() => setDate(todayEt())} style={navBtnStyle}>Today</button>}
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      {!error && data === null && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>}
      {!error && data !== null && <div className="min-w-0 overflow-x-auto overscroll-x-contain"><DailyRecapTable data={data} date={date} /></div>}
    </div>
  )
}
