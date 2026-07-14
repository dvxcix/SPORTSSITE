'use client'

import { useRef } from 'react'
import type { DerbyPlayer } from './HrDerbyTable'
import type { LiveHr } from '@/lib/hrDerbyLiveCash'

export type LiveStatus = {
  state: string
  currentRound: number
  currentBatter: { id: number; fullName: string } | null
  pitchesRemaining: number
  swingsRemaining: number
  bonusOutsCurrent: number
  bonusOutsTotal: number
  inTieBreaker: boolean
} | null

const ROUND_NAMES: Record<number, string> = { 1: 'Round 1', 2: 'Semifinals', 3: 'Finals' }

export function LiveDerbyTracker({ players, status, hrs }: { players: DerbyPlayer[]; status: LiveStatus; hrs: LiveHr[] }) {
  const byId = useRef(new Map(players.map(p => [p.mlbId, p])))
  const live = status?.state === 'Live'

  if (!status && hrs.length === 0) return null

  const byPlayer = new Map<number, { hrs: number; longest: number; hardest: number; totalDist: number; totalEv: number; count: number }>()
  for (const h of hrs) {
    const cur = byPlayer.get(h.playerId) ?? { hrs: 0, longest: 0, hardest: 0, totalDist: 0, totalEv: 0, count: 0 }
    cur.hrs += 1
    if (h.distance) { cur.longest = Math.max(cur.longest, h.distance); cur.totalDist += h.distance }
    if (h.exitVelocity) { cur.hardest = Math.max(cur.hardest, h.exitVelocity); cur.totalEv += h.exitVelocity }
    cur.count += 1
    byPlayer.set(h.playerId, cur)
  }
  const leaderboard = Array.from(byPlayer.entries())
    .map(([playerId, s]) => ({ playerId, ...s, avgEv: s.count ? s.totalEv / s.count : 0, avgDist: s.count ? s.totalDist / s.count : 0 }))
    .sort((a, b) => b.hrs - a.hrs)

  const currentBatter = status?.currentBatter ? byId.current.get(status.currentBatter.id) : null

  return (
    <div className="ss-card" style={{ padding: 14, marginBottom: 20, border: live ? '1px solid var(--accent)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {live && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, color: '#fff', background: 'var(--red)', padding: '3px 9px', borderRadius: 99 }}>
            <span className="live-dot" style={{ background: '#fff' }} />
            LIVE
          </span>
        )}
        <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>
          {status ? (ROUND_NAMES[status.currentRound] ?? `Round ${status.currentRound}`) : 'Live Tracker'}
        </p>
        {status?.currentBatter && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            {currentBatter && <img src={currentBatter.headshotUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />}
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{status.currentBatter.fullName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>at bat</span>
          </span>
        )}
      </div>

      {status && !status.inTieBreaker && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>
          {status.swingsRemaining} swings left · {status.bonusOutsTotal - status.bonusOutsCurrent} outs left
        </p>
      )}

      {leaderboard.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Player</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>HRs</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Longest</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Hardest</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Avg EV</th>
                <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Avg Dist</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, i) => {
                const p = byId.current.get(row.playerId)
                return (
                  <tr key={row.playerId} style={{ borderBottom: i < leaderboard.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {p && <img src={p.headshotUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />}
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{p?.name ?? row.playerId}</span>
                      </div>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--accent)' }}>{row.hrs}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 12.5 }}>{row.longest.toFixed(0)} ft</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 12.5 }}>{row.hardest.toFixed(1)} mph</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 12.5 }}>{row.avgEv.toFixed(1)} mph</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 12.5 }}>{row.avgDist.toFixed(0)} ft</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
