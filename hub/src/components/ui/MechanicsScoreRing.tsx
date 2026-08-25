import type { CSSProperties } from 'react'
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
  const value = Math.max(0, Math.min(100, score))
  return (
    <div
      className={`${styles.scoreRing}${className ? ` ${className}` : ''}`}
      data-size={size}
      data-tone={mechanicsScoreTone(value)}
      style={{ '--score': `${value * 3.6}deg` } as CSSProperties}
      aria-label={`${label} ${Math.round(value)}`}
    >
      <span>
        <strong>{Math.round(value)}</strong>
        <small><Image src="/logo.png" alt="" width={10} height={10} aria-hidden="true" /><em>SCORE</em></small>
      </span>
    </div>
  )
}

