import Image from 'next/image'
import styles from './SlipSurgeLogo.module.css'

/** Finished brand artwork; the surface chooses the supplied colour variant. */
export function SlipSurgeLogo({
  variant = 'horizontal',
  width = variant === 'symbol' ? 32 : 144,
  appearance = 'auto',
  decorative = false,
  className,
  priority = false,
}: {
  variant?: 'horizontal' | 'symbol'
  width?: number
  appearance?: 'auto' | 'dark' | 'light'
  decorative?: boolean
  className?: string
  priority?: boolean
}) {
  const height = variant === 'symbol' ? width : Math.round(width * 256 / 870)
  const artwork = variant === 'horizontal' ? 'logo-header' : width <= 32 ? 'symbol-small' : 'symbol'
  return <span
    className={`${styles.logo}${className ? ` ${className}` : ''}`}
    data-brand-logo={variant}
    data-appearance={appearance}
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : 'SlipSurge'}
    aria-hidden={decorative || undefined}
    style={{ width, height }}
  >
    <Image className={styles.onDark} src={`/brand/2027/${artwork}-on-dark.svg`} alt="" width={width} height={height} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'none' }} preload={priority} unoptimized />
    <Image className={styles.onLight} src={`/brand/2027/${artwork}-on-light.svg`} alt="" width={width} height={height} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'none' }} unoptimized />
  </span>
}
