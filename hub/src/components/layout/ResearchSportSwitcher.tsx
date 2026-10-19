'use client'

import { SafeImage } from '@/components/ui/SafeImage'
import { availableResearchSports, resolveResearchSport, type ResearchSport } from './researchNavigation'
import styles from './researchNavigation.module.css'

export function ResearchSportSwitcher({ sport, onChange, nflAccess, nbaAccess = false, compact = false }: {
  sport: ResearchSport; onChange: (sport: ResearchSport) => void; nflAccess: boolean; nbaAccess?: boolean; compact?: boolean
}) {
  const selected = resolveResearchSport(sport, nflAccess, nbaAccess)
  return <div className={styles.switcher} data-compact={compact} role="group" aria-label="Research sport">
    {availableResearchSports(nflAccess, nbaAccess).map(value =>
      <button key={value} type="button" aria-pressed={selected === value} onClick={() => onChange(value)} title={value.toUpperCase() + ' research'}>
        <SafeImage src={`https://a.espncdn.com/i/teamlogos/leagues/500/${value}.png`} alt="" />
        <span>{value.toUpperCase()}</span>
      </button>)}
  </div>
}
