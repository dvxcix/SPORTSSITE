'use client'
import styles from './paint.module.css'
export default function Error({ reset }: { reset: () => void }) { return <section className={styles.empty}><h2>Let’s get you back on court.</h2><p>The board could not load.</p><button onClick={reset}>Try again</button></section> }
