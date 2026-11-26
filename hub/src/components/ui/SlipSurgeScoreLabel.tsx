import { SlipSurgeLogo } from '@/components/brand/SlipSurgeLogo'
import styles from './SlipSurgeScoreLabel.module.css'

export function SlipSurgeScoreLabel({
  prefix,
  compact = false,
  className,
}: {
  prefix?: string
  compact?: boolean
  className?: string
}) {
  const label = `${prefix ? `${prefix} ` : ''}SlipSurge Score`
  return (
    <span
      className={`${styles.label}${className ? ` ${className}` : ''}`}
      data-compact={compact ? 'true' : 'false'}
      aria-label={label}
    >
      {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
      <SlipSurgeLogo className={styles.logo} variant="symbol" width={16} decorative />
      <span className={styles.name}>SlipSurge</span>
      <span className={styles.score}>Score</span>
    </span>
  )
}
