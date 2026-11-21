import { useId } from 'react'
import styles from './volt.module.css'

/** The owner's VOLT handoff rig, limited to its silent idle character. */
export function VoltCharacter({ jersey = 'nfl' }: { jersey?: 'nfl' | 'nba' }) {
  const clip = `volt-body-${useId().replace(/:/g, '')}`
  return <svg className={styles.character} viewBox="0 -8 200 212" aria-hidden="true" focusable="false" data-jersey={jersey}>
    <ellipse className={styles.shadow} cx="100" cy="196" rx="50" ry="5" />
    <g className={styles.breath}>
      <path className={styles.body} d="M112 -4 L84 32 H101 L92 54 L128 20 H109 L119 -4 Z" />
      <g className={styles.body}><ellipse cx="31" cy="108" rx="24" ry="27" /><ellipse cx="169" cy="108" rx="24" ry="27" /></g>
      <path className={styles.body} d="M100 34 C152 34 172 58 172 112 C172 166 150 190 100 190 C50 190 28 166 28 112 C28 58 48 34 100 34 Z" />
      <defs><clipPath id={clip}><path d="M100 34 C152 34 172 58 172 112 C172 166 150 190 100 190 C50 190 28 166 28 112 C28 58 48 34 100 34 Z" /></clipPath></defs>
      {jersey === 'nfl' ? <path className={styles.trim} strokeWidth="5" d="M9 102 h18 M8 113 h18 M191 102 h-18 M192 113 h-18" />
        : <g clipPath={`url(#${clip})`}><path className={styles.trim} strokeWidth="6" d="M70 30 Q100 62 130 30" /><path className={styles.trim} strokeWidth="5" d="M30 70 Q52 110 30 150 M170 70 Q148 110 170 150" /></g>}
      <text className={styles.number} x="100" y="160">7</text>
      <g className={styles.eyes}><rect x="72" y="76" width="15" height="30" rx="7.5" /><rect x="113" y="76" width="15" height="30" rx="7.5" /></g>
      <ellipse className={styles.mouth} cx="100" cy="114" rx="8" ry="6.5" />
    </g>
  </svg>
}
