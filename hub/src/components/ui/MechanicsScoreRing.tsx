import Image from 'next/image'
import styles from './MechanicsScoreRing.module.css'

export function mechanicsScoreTone(score: number) {
  if (score >= 70) return 'elite'
  if (score >= 58) return 'positive'
  if (score < 40) return 'cold'
  return 'neutral'
}

export function MechanicsScoreRing({
  score,
  label = 'SlipSurge Score',
  size = 'large',
  className,
}: {
  score: number
  label?: string
  size?: 'large' | 'small'
  className?: string
}) {
  const available = Number.isFinite(score)
  const value = available ? Math.max(0, Math.min(100, score)) : 0
  return (
    <div
      className={`${styles.scoreRing}${className ? ` ${className}` : ''}`}
      data-size={size}
      data-tone={mechanicsScoreTone(value)}
      data-empty={!available}
      role="img"
      aria-label={`${label} ${available ? `${Math.round(value)} out of 100` : 'unavailable'}`}
    >
      <svg className={styles.graphic} viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle className={styles.track} cx="50" cy="50" r="44"/>{available && value > 0 && <circle className={styles.progress} cx="50" cy="50" r="44" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 50 50)"/>}</svg>
      <span className={styles.center} aria-hidden="true">
        <strong>{available ? Math.round(value) : '—'}</strong>
        <small><Image src="/logo.png" alt="" width={10} height={10} aria-hidden="true" />{size !== 'small' && <em>SCORE</em>}</small>
      </span>
    </div>
  )
}

