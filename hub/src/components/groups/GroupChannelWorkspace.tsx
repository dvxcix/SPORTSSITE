import Link from 'next/link'
import { Bell, Hash, MessageSquareText, Radio, TrendingUp } from 'lucide-react'
import styles from './GroupChannelWorkspace.module.css'

export type GroupWorkspaceChannel = {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  channel_kind: 'text' | 'live' | 'picks' | 'announcements'
}

const KIND_ICONS = {
  text: MessageSquareText,
  live: Radio,
  picks: TrendingUp,
  announcements: Bell,
}

export function GroupChannelWorkspace({ groupSlug, channels, activeChannel, children }: {
  groupSlug: string
  channels: GroupWorkspaceChannel[]
  activeChannel: GroupWorkspaceChannel
  children: React.ReactNode
}) {
  const ActiveIcon = KIND_ICONS[activeChannel.channel_kind] ?? Hash
  return (
    <section className={styles.workspace}>
      <aside className={styles.rail} aria-label="Community channels">
        <header><strong>Channels</strong><span>{channels.length}</span></header>
        <nav>
          {channels.map(channel => {
            const Icon = KIND_ICONS[channel.channel_kind] ?? Hash
            const active = channel.id === activeChannel.id
            return (
              <Link
                key={channel.id}
                href={`/groups/${groupSlug}?view=chat&channel=${encodeURIComponent(channel.slug)}`}
                aria-current={active ? 'page' : undefined}
                className={active ? styles.active : undefined}
                scroll={false}
              >
                <span>{channel.icon || <Icon size={14} />}</span>
                <span><strong>{channel.name}</strong><small>{channel.channel_kind}</small></span>
              </Link>
            )
          })}
        </nav>
      </aside>
      <div className={styles.room}>
        <header className={styles.roomHeader}>
          <span><ActiveIcon size={15} /></span>
          <div><strong>{activeChannel.name}</strong>{activeChannel.description && <small>{activeChannel.description}</small>}</div>
        </header>
        {children}
      </div>
    </section>
  )
}
