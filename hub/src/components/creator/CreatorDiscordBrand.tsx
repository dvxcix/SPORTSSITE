import { Check, Hash } from 'lucide-react'
import { WhopLogo } from '@/components/brand/WhopLogo'
import { DiscordLogo } from '@/components/brand/DiscordLogo'
import styles from './creatorDiscord.module.css'

export function DiscordConnectionHeader({ titleId, title, description, status, complete = false }: {
  titleId: string; title: string; description: string; status?: string; complete?: boolean
}) {
  return <div className={styles.brandHeader}>
    <span className={styles.brandMark}><DiscordLogo size={30}/></span>
    <div className={styles.brandHeading}><h2 id={titleId}>{title}</h2><p>{description}</p></div>
    {status && <span className={styles.connectionState} data-complete={complete || undefined}>{complete && <Check size={13} aria-hidden/>}{status}</span>}
  </div>
}

export function DiscordRoleTags({ roles }: { roles: string[] }) {
  return <ul className={styles.roleTags} aria-label="Member roles">{roles.map((role, index) => <li key={`${role}-${index}`}><Hash size={13} aria-hidden/><span>{role}</span></li>)}</ul>
}

export function DiscordAccountIdentity({ handle }: { handle?: string | null }) {
  return <div className={`ss-connection-identity is-connected ${styles.accountIdentity}`}>
    <span><DiscordLogo size={20}/></span><div><small>Connected as</small><strong>{handle || 'Linked to SlipSurge'}</strong></div><Check size={16} className={styles.identityCheck} aria-hidden/>
  </div>
}

export function WhopInlineMark() {
  return <WhopLogo/>
}
