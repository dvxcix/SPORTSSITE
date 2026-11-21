import { useId } from 'react'
import styles from './volt.module.css'

/** The owner's VOLT silhouette with soft volume and a grounded idle shadow. */
export function VoltCharacter({ jersey = 'nfl' }: { jersey?: 'nfl' | 'nba' }) {
  const id = `volt-${useId().replace(/:/g, '')}`
  const body = `url(#${id}-body)`, sleeve = `url(#${id}-sleeve)`
  return <svg className={styles.character} viewBox="0 -8 200 212" aria-hidden="true" focusable="false" data-jersey={jersey}>
    <defs>
      <radialGradient id={`${id}-body`} cx="32%" cy="20%" r="88%">
        <stop stopColor="#e9ffc3" /><stop offset=".3" stopColor="#caff7b" /><stop offset=".58" stopColor="#b4f64a" /><stop offset=".82" stopColor="#8bd332" /><stop offset="1" stopColor="#69aa22" />
      </radialGradient>
      <radialGradient id={`${id}-sleeve`} cx="34%" cy="25%" r="85%">
        <stop stopColor="#d8ff9b" /><stop offset=".5" stopColor="#b4f64a" /><stop offset="1" stopColor="#79bb2b" />
      </radialGradient>
      <linearGradient id={`${id}-tuft`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#edffd1" /><stop offset=".48" stopColor="#beff60" /><stop offset="1" stopColor="#81c42d" />
      </linearGradient>
      <radialGradient id={`${id}-shadow`}>
        <stop stopColor="#061406" stopOpacity=".48" /><stop offset="1" stopColor="#061406" stopOpacity="0" />
      </radialGradient>
      <clipPath id={`${id}-clip`}><path d="M100 34 C152 34 172 58 172 112 C172 166 150 190 100 190 C50 190 28 166 28 112 C28 58 48 34 100 34 Z" /></clipPath>
    </defs>
    <ellipse className={styles.shadow} fill={`url(#${id}-shadow)`} cx="100" cy="197" rx="61" ry="10" />
    <g className={styles.hover}><g className={styles.breath}>
      <path fill={`url(#${id}-tuft)`} d="M112 -4 L84 32 H101 L92 54 L128 20 H109 L119 -4 Z" />
      <g fill={sleeve}><ellipse cx="31" cy="108" rx="24" ry="27" /><ellipse cx="169" cy="108" rx="24" ry="27" /></g>
      <path fill={body} stroke="#e7ffc3" strokeOpacity=".28" strokeWidth="1.4" d="M100 34 C152 34 172 58 172 112 C172 166 150 190 100 190 C50 190 28 166 28 112 C28 58 48 34 100 34 Z" />
      {jersey === 'nfl' ? <path className={styles.trim} strokeWidth="5" d="M9 102 h18 M8 113 h18 M191 102 h-18 M192 113 h-18" />
        : <g clipPath={`url(#${id}-clip)`}><path className={styles.trim} strokeWidth="6" d="M70 30 Q100 62 130 30" /><path className={styles.trim} strokeWidth="5" d="M30 70 Q52 110 30 150 M170 70 Q148 110 170 150" /></g>}
      <text className={styles.number} x="100" y="160">7</text>
      <g className={styles.eyes}><rect x="72" y="76" width="15" height="30" rx="7.5" /><rect x="113" y="76" width="15" height="30" rx="7.5" /></g>
      <ellipse className={styles.mouth} cx="100" cy="114" rx="8" ry="6.5" />
    </g></g>
  </svg>
}
