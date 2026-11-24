import Image from 'next/image'
import styles from './providerMarks.module.css'

/** Preserve the existing orange symbol with a theme-aware wordmark. */
export function WhopLogo() {
  return <span className={styles.whop}><span aria-hidden="true"><Image src="/brands/whop-logo.svg" alt="" width={92} height={21}/></span><strong>Whop</strong></span>
}
