import { nflCompactDesignation } from '@/lib/nflSidelineResult'
import styles from './sidelineBoard.module.css'

export function SidelineDesignation({label,injury}:{label:string|null;injury?:string|null}) {
  if (!label) return null
  const mark=nflCompactDesignation(label), detail=[label,injury].filter(Boolean).join(' · ')
  return <abbr className={styles.availabilityBadge} data-status={mark.attention?'attention':'available'} title={detail} aria-label={detail}>{mark.text}</abbr>
}
