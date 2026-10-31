'use client'

import { SafeImage } from '@/components/ui/SafeImage'
import { LockKeyhole } from 'lucide-react'
import { availableResearchSports, resolveResearchSport, type ResearchSport } from './researchNavigation'
import styles from './researchNavigation.module.css'

export function ResearchSportSwitcher({ sport, onChange, nflAccess, nbaAccess = false, mlbAccess = false, compact = false }: {
  sport: ResearchSport; onChange: (sport: ResearchSport) => void; nflAccess: boolean; nbaAccess?: boolean; mlbAccess?: boolean; compact?: boolean
}) {
  const selected = resolveResearchSport(sport, nflAccess, mlbAccess)
  return <div className={styles.switcher} data-compact={compact} role="group" aria-label="Research sport">
    {availableResearchSports(nflAccess, mlbAccess).map(value =>
      <button key={value} type="button" aria-pressed={selected === value} onClick={() => onChange(value)} aria-label={`${value.toUpperCase()} research${value === 'nba' && !nbaAccess ? ' · Ultimate required' : ''}`} title={value === 'nba' ? undefined : value.toUpperCase() + ' research'}>
        <SafeImage src={`https://a.espncdn.com/i/teamlogos/leagues/500/${value}.png`} alt="" />
        <span>{value.toUpperCase()}</span>
        {value === 'nba' && !nbaAccess && <LockKeyhole size={11} aria-hidden="true" />}
      </button>)}
  </div>
}
