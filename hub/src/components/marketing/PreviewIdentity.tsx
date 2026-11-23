import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { nflPlayerPortrait } from '@/lib/nflPlayerPortrait'
import type { PreviewPlayer, PreviewSport } from '@/lib/publicResearchPreview'
import styles from './PreviewIdentity.module.css'
export { PreviewPlayerChart } from './PreviewPlayerChart'

export type PreviewIdentityPlayer = PreviewPlayer & { portraitUrl?: string | null; position?: string | null; recent?: number[] }

/** The same artwork contract as member cards: supplied identity, never a name guess. */
export function PreviewPlayerIdentity({ player, sport, size = 44, compact = false }: {
  player: PreviewIdentityPlayer; sport: PreviewSport; size?: number; compact?: boolean
}) {
  const portrait = sport === 'nfl' ? nflPlayerPortrait({ headshot: player.portraitUrl }) : player.portraitUrl
  return <span className={styles.identity} data-compact={compact || undefined}>
    <PlayerAvatar name={player.name} headshot={portrait} sport={sport} playerId={player.id} teamAbbr={player.team} size={size} />
    <span className={styles.labels}><strong>{player.name}</strong><span>{player.team}{player.position ? ' · ' + player.position : ''}</span></span>
  </span>
}

export function PreviewTeamMark({ sport, team, size = 28 }: { sport: PreviewSport; team: string; size?: number }) {
  return <SafeImage src={sportTeamLogoUrl(sport, team)} alt="" width={size} height={size} className={styles.teamMark}
    fallback={<span className={styles.teamFallback} style={{width:size,height:size}} aria-hidden="true">{team}</span>} />
}
