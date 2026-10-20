'use client'

import Link from 'next/link'
import { getGameStatus, getTeams, type ESPNGame } from '@slipsurge/core/espn-api'
import { TeamLogo } from './PlayerAvatar'
import styles from './NFLScoreRow.module.css'

export function NFLScoreRow({ game, sport = 'nfl' }: { game: ESPNGame; sport?: 'nfl' | 'nba' }) {
  const { away, home } = getTeams(game)
  if (!away || !home) return null
  const status = getGameStatus(game)
  const showScore = status.state !== 'pre'
  return (
    <Link href={`/sports/${sport}/${encodeURIComponent(game.id)}`} className={styles.row} aria-label={`${game.name} · ${status.label} · Game details`}>
      <div className={styles.team}>
        <TeamLogo logo={away.team.logo} name={away.team.abbreviation} size={30} />
        <span className={styles.name}><span className={styles.full}>{away.team.displayName}</span><span className={styles.short}>{away.team.abbreviation}</span></span>
        {showScore && <strong className={styles.score}>{away.score}</strong>}
      </div>
      <div className={styles.status} data-live={status.isLive}>
        {status.isLive && <span className={styles.live}>● LIVE</span>}
        <span>{status.label}</span>
      </div>
      <div className={`${styles.team} ${styles.home}`}>
        {showScore && <strong className={styles.score}>{home.score}</strong>}
        <span className={styles.name}><span className={styles.full}>{home.team.displayName}</span><span className={styles.short}>{home.team.abbreviation}</span></span>
        <TeamLogo logo={home.team.logo} name={home.team.abbreviation} size={30} />
      </div>
    </Link>
  )
}
