import Link from 'next/link'
import { AlertTriangle, LoaderCircle, SearchX } from 'lucide-react'
import styles from './page-state.module.css'

type PageStateProps = {
  kind?: 'loading' | 'error' | 'empty'
  title: string
  message: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  compact?: boolean
}

export function PageState({ kind = 'empty', title, message, actionLabel, actionHref, onAction, compact = false }: PageStateProps) {
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? AlertTriangle : SearchX
  const action = actionLabel && (actionHref || onAction)
    ? actionHref
      ? <Link className={styles.action} href={actionHref}>{actionLabel}</Link>
      : <button className={styles.action} type="button" onClick={onAction}>{actionLabel}</button>
    : null

  return (
    <section className={styles.state} data-kind={kind} data-compact={compact || undefined} aria-live={kind === 'error' ? 'assertive' : 'polite'} aria-busy={kind === 'loading' || undefined}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.icon}><Icon size={22} aria-hidden="true" /></div>
      <div className={styles.copy}><strong>{title}</strong><span>{message}</span></div>
      {action}
    </section>
  )
}
