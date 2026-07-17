'use client'

import { useState } from 'react'
import { TeamLogo } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import type { TodayGame } from '@/lib/mlbSchedule'
import { PitcherVsLineup } from './PitcherVsLineup'

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 800,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-dim)' : 'var(--surface)',
  color: active ? 'var(--accent)' : 'var(--text-2)', borderRadius: 10,
})

// One game, one pitching direction shown at a time — both starters' full
// matchup breakdowns loading simultaneously would mean ~25+ concurrent
// pitch-log fetches (2 pitchers + both full lineups) the moment a game is
// selected. A 2-way tab keeps only one side's worth of network/render work
// live, and lets the page stay readable instead of showing both 9-batter
// tables stacked at once.
export function GameMatchup({ game }: { game: TodayGame }) {
  const [side, setSide] = useState<'away' | 'home'>(game.awayPitcher ? 'away' : 'home')

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={tabStyle(side === 'away')} onClick={() => setSide('away')}>
          <TeamLogo logo={getTeamLogoUrl(game.awayAbbr)} name={game.awayAbbr} size={20} />
          {game.awayAbbr} pitching
        </button>
        <button style={tabStyle(side === 'home')} onClick={() => setSide('home')}>
          <TeamLogo logo={getTeamLogoUrl(game.homeAbbr)} name={game.homeAbbr} size={20} />
          {game.homeAbbr} pitching
        </button>
      </div>

      {side === 'away' ? (
        game.awayPitcher ? (
          <PitcherVsLineup
            key={`${game.gameKey}-away`}
            pitcher={game.awayPitcher}
            pitcherTeamAbbr={game.awayAbbr}
            pitcherTeamId={game.awayTeamId}
            opposingLineup={game.homeLineup}
            opposingTeamAbbr={game.homeAbbr}
            opposingTeamName={game.homeTeam}
            lineupConfirmed={game.homeLineupConfirmed}
          />
        ) : (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 24, textAlign: 'center' }}>No probable starter announced yet for {game.awayAbbr}.</div>
        )
      ) : (
        game.homePitcher ? (
          <PitcherVsLineup
            key={`${game.gameKey}-home`}
            pitcher={game.homePitcher}
            pitcherTeamAbbr={game.homeAbbr}
            pitcherTeamId={game.homeTeamId}
            opposingLineup={game.awayLineup}
            opposingTeamAbbr={game.awayAbbr}
            opposingTeamName={game.awayTeam}
            lineupConfirmed={game.awayLineupConfirmed}
          />
        ) : (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 24, textAlign: 'center' }}>No probable starter announced yet for {game.homeAbbr}.</div>
        )
      )}
    </div>
  )
}
