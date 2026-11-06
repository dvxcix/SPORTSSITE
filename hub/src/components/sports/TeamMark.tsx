import { SafeImage } from '@/components/ui/SafeImage'
import { sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { sportLogoUrl } from '@/lib/sportLogos'

/** Shared pick surfaces must identify the league before resolving a team. */
export function TeamMark({ sport, team, size = 16 }: { sport?: string | null; team?: string | null; size?: number }) {
  if (!team) return null
  const label = `${sport?.trim().toUpperCase() ?? ''} ${team}`.trim()
  const style = { width: size, height: size, objectFit: 'contain' as const, flexShrink: 0 }
  const fallback = sportLogoUrl(sport ?? '')
    ? <SafeImage src={sportLogoUrl(sport ?? '')} alt={label} title={label} style={style} />
    : <span>{team}</span>
  return <SafeImage src={sportTeamLogoUrl(sport, team)} alt={label} title={label} style={style} fallback={fallback} />
}
