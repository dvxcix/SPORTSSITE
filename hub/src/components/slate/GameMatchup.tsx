'use client'

import { useState, type CSSProperties } from 'react'
import { ArrowRight, Check, Crosshair } from 'lucide-react'
import { PlayerAvatar, TeamLogo } from '@/components/sports/PlayerAvatar'
import { getTeamColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { PitcherVsLineup, type MatchupResearchContext } from './PitcherVsLineupExperience'
import styles from './MatchupExperience.module.css'

// One game, one pitching direction shown at a time — both starters' full
// matchup breakdowns loading simultaneously would mean ~25+ concurrent
// pitch-log fetches (2 pitchers + both full lineups) the moment a game is
// selected. A 2-way tab keeps only one side's worth of network/render work
// live, and lets the page stay readable instead of showing both 9-batter
// tables stacked at once.
export function GameMatchup({ game, selectedBatterId, onResearchContextChange }: {
  game: TodayGame
  selectedBatterId?: number | null
  onResearchContextChange?: (context: MatchupResearchContext) => void
}) {
  const [manualChoice, setManualChoice] = useState<{ side: 'away' | 'home'; forBatter: number | null }>({
    side: game.awayPitcher ? 'away' : 'home',
    forBatter: null,
  })
  const homePool = game.homeCandidates?.length ? game.homeCandidates : game.homeLineup
  const awayPool = game.awayCandidates?.length ? game.awayCandidates : game.awayLineup
  const batterSide = selectedBatterId != null && homePool.some(player => player.mlb_id === selectedBatterId)
    ? 'away'
    : selectedBatterId != null && awayPool.some(player => player.mlb_id === selectedBatterId) ? 'home' : null
  const side = manualChoice.forBatter === (selectedBatterId ?? null) ? manualChoice.side : batterSide ?? manualChoice.side

  const directions = [
    { key: 'away' as const, pitcher: game.awayPitcher, pitcherTeam: game.awayAbbr, opponent: game.homeAbbr, confirmed: game.homeLineupConfirmed },
    { key: 'home' as const, pitcher: game.homePitcher, pitcherTeam: game.homeAbbr, opponent: game.awayAbbr, confirmed: game.awayLineupConfirmed },
  ]

  return (
    <div className={styles.experience}>
      <div className={styles.directionPicker} aria-label="Choose pitching matchup">
        {directions.map(direction => {
          const active = side === direction.key
          return (
            <button
              key={direction.key}
              type="button"
              className={styles.directionButton}
              data-active={active}
              disabled={!direction.pitcher}
              onClick={() => setManualChoice({ side: direction.key, forBatter: selectedBatterId ?? null })}
              aria-pressed={active}
              style={{ '--matchup-team': getTeamColor(direction.pitcherTeam) } as CSSProperties}
            >
              <span className={styles.directionTeam}>
                <TeamLogo logo={getTeamLogoUrl(direction.pitcherTeam)} name={direction.pitcherTeam} size={32} />
                <small>{direction.pitcherTeam} starter</small>
              </span>
              {direction.pitcher ? (
                <span className={styles.directionPitcher}>
                  <PlayerAvatar headshot={mlbHeadshot(direction.pitcher.id)} teamLogo={getTeamLogoUrl(direction.pitcherTeam)} teamAbbr={direction.pitcherTeam} name={direction.pitcher.name} size={38} />
                  <span><strong>{direction.pitcher.name}</strong><small>{direction.pitcher.hand}HP</small></span>
                </span>
              ) : (
                <span className={styles.directionPitcher}><Crosshair size={18} /><span><strong>Starter TBD</strong><small>Awaiting matchup</small></span></span>
              )}
              <span className={styles.directionOpponent}>
                <ArrowRight size={14} />
                <TeamLogo logo={getTeamLogoUrl(direction.opponent)} name={direction.opponent} size={28} />
                <span><strong>{direction.opponent}</strong><small>{direction.confirmed ? 'Confirmed lineup' : 'Projected lineup'}</small></span>
              </span>
              {active && <Check className={styles.directionCheck} size={15} />}
            </button>
          )
        })}
      </div>

      {side === 'away' ? (
        game.awayPitcher ? (
          <PitcherVsLineup
            key={`${game.gameKey}-away-${game.awayPitcher.id}`}
            pitcher={game.awayPitcher}
            pitcherTeamAbbr={game.awayAbbr}
            pitcherTeamId={game.awayTeamId}
            opposingLineup={game.homeLineup}
            opposingTeamAbbr={game.homeAbbr}
            opposingTeamName={game.homeTeam}
            lineupConfirmed={game.homeLineupConfirmed}
            selectedBatterId={selectedBatterId}
            onResearchContextChange={onResearchContextChange}
          />
        ) : (
          <div className={styles.emptyMatchup}>No probable starter announced yet for {game.awayAbbr}.</div>
        )
      ) : (
        game.homePitcher ? (
          <PitcherVsLineup
            key={`${game.gameKey}-home-${game.homePitcher.id}`}
            pitcher={game.homePitcher}
            pitcherTeamAbbr={game.homeAbbr}
            pitcherTeamId={game.homeTeamId}
            opposingLineup={game.awayLineup}
            opposingTeamAbbr={game.awayAbbr}
            opposingTeamName={game.awayTeam}
            lineupConfirmed={game.awayLineupConfirmed}
            selectedBatterId={selectedBatterId}
            onResearchContextChange={onResearchContextChange}
          />
        ) : (
          <div className={styles.emptyMatchup}>No probable starter announced yet for {game.homeAbbr}.</div>
        )
      )}
    </div>
  )
}
