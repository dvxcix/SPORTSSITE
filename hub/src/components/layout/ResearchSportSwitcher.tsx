'use client'

import { SafeImage } from '@/components/ui/SafeImage'
import type { ResearchSport } from './researchNavigation'
import styles from './researchNavigation.module.css'

export function ResearchSportSwitcher({ sport, onChange, nflAccess, compact = false }: {
  sport: ResearchSport; onChange: (sport: ResearchSport) => void; nflAccess: boolean; compact?: boolean
}) {
  return <div className={styles.switcher} data-compact={compact} role="group" aria-label="Research sport">
    {(['mlb', ...(nflAccess ? ['nfl'] : [])] as ResearchSport[]).map(value =>
      <button key={value} type="button" aria-pressed={sport === value} onClick={() => onChange(value)} title={value.toUpperCase() + ' research'}>
        <SafeImage src={`https://a.espncdn.com/i/teamlogos/leagues/500/${value}.png`} alt="" />
        <span>{value.toUpperCase()}</span>
      </button>)}
  </div>
}
