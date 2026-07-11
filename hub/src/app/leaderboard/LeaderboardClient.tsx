'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy, TrendingUp, Target, Flame } from 'lucide-react'

type UserRow = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  account_type: string
  follower_count: number
  wins: number
  losses: number
  pushes: number
  total: number
  winPct: number
  streak: number
  recentResults: ('W' | 'L' | 'P')[]
  thisWeek: { wins: number; losses: number }
  bySport: Record<string, { wins: number; losses: number; pushes: number }>
}

const SPORT_LABELS: Record<string, string> = {
  mlb: 'MLB', nfl: 'NFL', nba: 'NBA', nhl: 'NHL',
  soccer: 'MLS', mma: 'MMA',
}

const SPORT_EMOJI: Record<string, string> = {
  mlb: 'b', nfl: 'f', nba: 'b', nhl: 'h', soccer: 's', mma: 'm',
}

function Avatar({ user, size = 40 }: { user: UserRow; size?: number }) {
  const initials = (user.display_name || user.username).slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: user.avatar_url ? 'transparent' : 'var(--accent-dim)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 800, color: 'var(--accent)',
    }}>
      {user.avatar_url
        ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials
      }
    </div>
  )
}

function StreakBadge({ streak }: { streak: number }) {
  if (Math.abs(streak) < 2) return null
  const isHot = streak > 0
  const abs = Math.abs(streak)
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 99,
      background: isHot ? 'rgba(180,255,77,0.12)' : 'rgba(255,77,106,0.12)',
      color: isHot ? 'var(--accent)' : 'var(--red)',
      border: `1px solid ${isHot ? 'rgba(180,255,77,0.25)' : 'rgba(255,77,106,0.25)'}`,
    }}>
      {isHot ? `W${abs}` : `L${abs}`}
    </span>
  )
}

function RecentDots({ results }: { results: ('W' | 'L' | 'P')[] }) {
  if (results.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {results.slice(0, 5).map((r, i) => (
        <span key={i} style={{
          width: 14, height: 14, borderRadius: '50%', fontSize: 8, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: r === 'W' ? 'rgba(74,222,128,0.15)' : r === 'L' ? 'rgba(255,77,106,0.15)' : 'rgba(255,200,0,0.15)',
          color: r === 'W' ? '#4ade80' : r === 'L' ? 'var(--red)' : '#ffc800',
        }}>{r}</span>
      ))}
    </div>
  )
}

function PodiumCard({ user, rank }: { user: UserRow; rank: 1 | 2 | 3 }) {
  const [hovered, setHovered] = useState(false)
  const isFirst = rank === 1
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'
  const graded = user.wins + user.losses

  return (
    <Link href={`/profile/${user.username}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          padding: isFirst ? '24px 12px 20px' : '18px 10px 16px',
          background: hovered ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${rank === 1 ? 'rgba(180,255,77,0.3)' : rank === 2 ? 'rgba(200,200,200,0.15)' : 'rgba(180,100,0,0.2)'}`,
          borderRadius: 16, transition: 'all 150ms',
          marginTop: isFirst ? 0 : 24,
        }}
      >
        <span style={{ fontSize: isFirst ? 28 : 22, marginBottom: 10 }}>{medal}</span>
        <Avatar user={user} size={isFirst ? 56 : 44} />
        <p style={{ fontSize: isFirst ? 13 : 12, fontWeight: 800, color: 'var(--text-1)', marginTop: 10, lineHeight: 1.2 }}>
          {user.display_name || user.username}
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>@{user.username}</p>
        <p style={{ fontSize: isFirst ? 16 : 13, fontWeight: 900, color: graded > 0 && user.winPct >= 55 ? '#4ade80' : 'var(--text-2)', marginTop: 8 }}>
          {graded > 0 ? `${user.winPct}%` : 'No picks'}
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
          {user.wins}W-{user.losses}L
        </p>
      </div>
    </Link>
  )
}

function RankRow({ user, rank }: { user: UserRow; rank: number }) {
  const [hovered, setHovered] = useState(false)
  const graded = user.wins + user.losses
  const rankLabel = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`

  return (
    <Link href={`/profile/${user.username}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: hovered ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${hovered ? 'var(--border-2)' : 'var(--border)'}`,
          borderRadius: 14, transition: 'all 130ms',
        }}
      >
        <span style={{ width: 32, textAlign: 'center', fontSize: rank <= 3 ? 18 : 13, fontWeight: 900, color: 'var(--text-3)', flexShrink: 0 }}>{rankLabel}</span>
        <Avatar user={user} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.display_name || user.username}
            </p>
            {user.is_verified && <span style={{ color: '#4ade80', fontSize: 12, flexShrink: 0 }}>✓</span>}
            {user.account_type === 'creator' && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99, background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.15)', flexShrink: 0 }}>
                PRO
              </span>
            )}
            <StreakBadge streak={user.streak} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>@{user.username}</p>
            <RecentDots results={user.recentResults} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: graded > 0 && user.winPct >= 55 ? '#4ade80' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
              {graded > 0 ? `${user.winPct}%` : '---'}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>WIN%</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
              {user.wins}-{user.losses}{user.pushes > 0 ? `-${user.pushes}` : ''}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{user.total} picks</p>
          </div>
        </div>
      </div>
    </Link>
  )
}

function WeekRow({ user, rank }: { user: UserRow; rank: number }) {
  const [hovered, setHovered] = useState(false)
  const w = user.thisWeek
  const graded = w.wins + w.losses
  const winPct = graded > 0 ? Math.round((w.wins / graded) * 1000) / 10 : 0

  return (
    <Link href={`/profile/${user.username}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: hovered ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${hovered ? 'var(--border-2)' : 'var(--border)'}`,
          borderRadius: 14, transition: 'all 130ms',
        }}
      >
        <span style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-3)', flexShrink: 0 }}>#{rank}</span>
        <Avatar user={user} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.display_name || user.username}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>@{user.username}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 900, color: winPct >= 55 ? '#4ade80' : 'var(--text-2)' }}>
            {graded > 0 ? `${winPct}%` : '---'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{w.wins}W-{w.losses}L this wk</p>
        </div>
      </div>
    </Link>
  )
}

type Tab = 'overall' | 'thisweek' | string

export function LeaderboardClient({ users, allSports }: { users: UserRow[]; allSports: string[] }) {
  const [tab, setTab] = useState<Tab>('overall')

  const topThree = users.slice(0, 3)
  const rest = users.slice(3)

  const weekUsers = [...users]
    .filter(u => u.thisWeek.wins + u.thisWeek.losses > 0)
    .sort((a, b) => {
      const aW = a.thisWeek.wins / (a.thisWeek.wins + a.thisWeek.losses || 1)
      const bW = b.thisWeek.wins / (b.thisWeek.wins + b.thisWeek.losses || 1)
      return bW - aW
    })

  const sportUsers = (sport: string) =>
    [...users]
      .filter(u => u.bySport[sport] && u.bySport[sport].wins + u.bySport[sport].losses > 0)
      .sort((a, b) => {
        const aS = a.bySport[sport], bS = b.bySport[sport]
        const aW = aS.wins / (aS.wins + aS.losses || 1)
        const bW = bS.wins / (bS.wins + bS.losses || 1)
        return bW - aW
      })
      .map(u => ({
        ...u,
        wins: u.bySport[sport].wins,
        losses: u.bySport[sport].losses,
        pushes: u.bySport[sport].pushes,
        total: u.bySport[sport].wins + u.bySport[sport].losses + u.bySport[sport].pushes,
        winPct: Math.round((u.bySport[sport].wins / (u.bySport[sport].wins + u.bySport[sport].losses || 1)) * 1000) / 10,
      }))

  const totalPicks = users.reduce((s, u) => s + u.wins + u.losses, 0)
  const eligibleUsers = users.filter(u => u.wins + u.losses >= 5)
  const avgWin = eligibleUsers.length > 0
    ? Math.round(eligibleUsers.reduce((s, u) => s + u.winPct, 0) / eligibleUsers.length)
    : 0
  const activeCnt = users.filter(u => u.total > 0).length

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overall', label: 'Overall' },
    { id: 'thisweek', label: 'This Week' },
    ...allSports.map(s => ({ id: s, label: SPORT_LABELS[s] || s.toUpperCase() })),
  ]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(180,255,77,0.08)', border: '1px solid rgba(180,255,77,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trophy size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Leaderboard</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Top cappers on SlipSurge</p>
          </div>
        </div>
        <Link href="/picks" style={{
          padding: '8px 16px', borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 12, fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <TrendingUp size={13} />
          Drop a Pick
        </Link>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { icon: <Target size={14} />, label: 'Picks Graded', value: totalPicks > 0 ? totalPicks.toLocaleString() : '0' },
          { icon: <TrendingUp size={14} />, label: 'Avg Win Rate', value: avgWin > 0 ? `${avgWin}%` : '--' },
          { icon: <Flame size={14} />, label: 'Active Cappers', value: String(activeCnt) },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', marginBottom: 6 }}>
              {icon}
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
              border: `1px solid ${tab === t.id ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === t.id ? 'var(--accent)' : 'var(--surface)',
              color: tab === t.id ? 'var(--accent-fg)' : 'var(--text-2)',
              cursor: 'pointer', transition: 'all 130ms', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overall */}
      {tab === 'overall' && (
        <>
          {topThree.length >= 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', gap: 10, marginBottom: 20 }}>
              <PodiumCard user={topThree[1]} rank={2} />
              <PodiumCard user={topThree[0]} rank={1} />
              <PodiumCard user={topThree[2]} rank={3} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topThree.length < 3
              ? users.map((u, i) => <RankRow key={u.id} user={u} rank={i + 1} />)
              : rest.map((u, i) => <RankRow key={u.id} user={u} rank={i + 4} />)
            }
          </div>
          {users.length === 0 && <EmptyState />}
        </>
      )}

      {/* This Week */}
      {tab === 'thisweek' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {weekUsers.length > 0
            ? weekUsers.map((u, i) => <WeekRow key={u.id} user={u} rank={i + 1} />)
            : <EmptyState label="No picks graded this week yet." />
          }
        </div>
      )}

      {/* Sport-specific */}
      {tab !== 'overall' && tab !== 'thisweek' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sportUsers(tab).length > 0
            ? sportUsers(tab).map((u, i) => <RankRow key={u.id} user={u} rank={i + 1} />)
            : <EmptyState label={`No graded ${SPORT_LABELS[tab] || tab} picks yet.`} />
          }
        </div>
      )}
    </div>
  )
}

function EmptyState({ label = 'Be the first to drop picks and climb the board.' }: { label?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>No rankings yet</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>{label}</p>
      <Link href="/picks" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px',
        borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-fg)',
        fontSize: 13, fontWeight: 800, textDecoration: 'none',
      }}>
        <TrendingUp size={14} />
        Drop Your First Pick
      </Link>
    </div>
  )
}
