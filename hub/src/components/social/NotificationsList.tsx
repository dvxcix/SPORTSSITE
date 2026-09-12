'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Bell, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users, TrendingUp, ClipboardCheck, X, Trash2, CheckCheck, type LucideIcon } from 'lucide-react'
import { useCustomEmojis } from '@/lib/emoji'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './NotificationsList.module.css'

export const NOTIF_ICONS: Record<string, LucideIcon> = {
  reaction: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
  pick_result: Trophy,
  message: MessageCircle,
  subscription: Zap,
  repost: Repeat2,
  group_invite: Users,
  new_pick: TrendingUp,
  lineup_confirmed: ClipboardCheck,
}

export type NotifRow = {
  id: string; type: string; message: string | null; body: string | null
  link: string | null; read: boolean; created_at: string
  actor?: { username: string; display_name?: string; avatar_url?: string } | null
  data?: { avatar_url?: string; emoji?: string; team_logo?: string; actors?: { id: string; avatar_url?: string }[]; count?: number } | null
}

function timeAgo(dateStr: string, nowMs: number) {
  const diff = nowMs - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function notificationHref(link: string | null) {
  return link?.startsWith('/') && !link.startsWith('//') ? link : null
}

export function NotificationsList({ userId, initialNotifications }: { userId: string; initialNotifications: NotifRow[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [renderedAt] = useState(() => Date.now())
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState<'all' | 'unread' | 'mentions'>('all')
  const [clearing, setClearing] = useState(false)
  const { confirm, notify } = useFeedback()

  async function deleteMany(ids: string[]) {
    const prev = notifications
    setNotifications(p => p.filter(n => !ids.includes(n.id)))
    const { error } = await supabase.from('notifications').delete().in('id', ids).eq('user_id', userId)
    if (error) {
      setNotifications(prev)
      notify({ title: 'Notification not removed', message: error.message, tone: 'error' })
    }
  }

  async function clearAll() {
    if (!await confirm({ title: 'Clear all notifications?', message: 'This permanently removes every notification in your inbox.', confirmLabel: 'Clear all', tone: 'error' })) return
    const prev = notifications
    setClearing(true)
    setNotifications([])
    const { error } = await supabase.from('notifications').delete().eq('user_id', userId)
    setClearing(false)
    if (error) {
      setNotifications(prev)
      notify({ title: 'Notifications not cleared', message: error.message, tone: 'error' })
    }
  }

  async function markAllRead() {
    const unreadRows = notifications.filter(notification => !notification.read)
    if (!unreadRows.length) return
    const unreadIds = new Set(unreadRows.map(notification => notification.id))
    setNotifications(current => current.map(notification => unreadIds.has(notification.id) ? { ...notification, read: true } : notification))
    const { error } = await supabase.from('notifications').update({ read: true }).in('id', [...unreadIds]).eq('user_id', userId)
    if (error) {
      setNotifications(current => current.map(notification => unreadIds.has(notification.id) ? { ...notification, read: false } : notification))
      notify({ title: 'Activity not updated', message: 'Please try again.', tone: 'error' })
    }
  }

  function markRead(ids: string[]) {
    const unreadIds = ids.filter(id => notifications.some(notification => notification.id === id && !notification.read))
    if (!unreadIds.length) return
    const unreadSet = new Set(unreadIds)
    setNotifications(current => current.map(notification => unreadSet.has(notification.id) ? { ...notification, read: true } : notification))
    void supabase.from('notifications').update({ read: true }).in('id', unreadIds).eq('user_id', userId).then(({ error }) => {
      if (!error) return
      setNotifications(current => current.map(notification => unreadSet.has(notification.id) ? { ...notification, read: false } : notification))
      notify({ title: 'Activity not updated', message: 'Please try again.', tone: 'error' })
    })
  }

  const unreadCount = notifications.filter(notification => !notification.read).length
  const filteredNotifications = filter === 'unread'
    ? notifications.filter(notification => !notification.read)
    : filter === 'mentions'
      ? notifications.filter(notification => notification.type === 'mention')
      : notifications

  const groups: Record<string, NotifRow[]> = {}
  for (const n of filteredNotifications) {
    const diff = Math.floor((renderedAt - new Date(n.created_at).getTime()) / 86400000)
    const key = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This Week' : 'Earlier'
    groups[key] = [...(groups[key] ?? []), n]
  }
  const groupedGroups: Record<string, (NotifRow | NotifRow[])[]> = {}
  for (const [label, items] of Object.entries(groups)) groupedGroups[label] = collapseConsecutiveFollows(items)

  if (notifications.length === 0) {
    return (
      <div className="ss-activity-empty">
        <span><Bell size={24} /></span>
        <strong>You&apos;re all caught up</strong>
        <p>New activity will appear here.</p>
      </div>
    )
  }

  return (
    <div className="ss-activity-center">
      <div className="ss-activity-toolbar">
        <div className="ss-activity-tabs" role="tablist" aria-label="Filter notifications">
          {(['all', 'unread', 'mentions'] as const).map(option => (
            <button type="button" role="tab" aria-selected={filter === option} data-active={filter === option ? 'true' : 'false'} key={option} onClick={() => setFilter(option)}>
              {option === 'all' ? 'All' : option === 'unread' ? 'Unread' : 'Mentions'}
              {option === 'unread' && unreadCount ? <span>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
            </button>
          ))}
        </div>
        <div className="ss-activity-actions">
          <button type="button" onClick={markAllRead} disabled={!unreadCount}><CheckCheck size={14} /> <span>Mark read</span></button>
          <button type="button" onClick={clearAll} disabled={clearing} className="danger"><Trash2 size={13} /> <span>{clearing ? 'Clearing…' : 'Clear'}</span></button>
        </div>
      </div>

      {filteredNotifications.length === 0 ? (
        <div className="ss-activity-filter-empty"><CheckCheck size={22} /><strong>No {filter} activity</strong><span>You&apos;re caught up here.</span></div>
      ) : <div className="ss-activity-groups">
        {Object.entries(groupedGroups).map(([label, entries]) => (
          <div key={label}>
            <div className="ss-activity-date-row">
              <p className="ss-activity-date">{label}</p>
              {entries.flat().some(notification => !notification.read) && <button type="button" onClick={() => markRead(entries.flat().map(notification => notification.id))}>Mark section read</button>}
            </div>
            <div className="ss-activity-rows">
              {entries.map(entry => Array.isArray(entry)
                ? <GroupedFollowRow key={entry[0].id} items={entry} nowMs={renderedAt} onRead={() => markRead(entry.map(n => n.id))} onDelete={() => deleteMany(entry.map(n => n.id))} />
                : <NotificationRow key={entry.id} n={entry} nowMs={renderedAt} onRead={() => markRead([entry.id])} onDelete={() => deleteMany([entry.id])} />
              )}
            </div>
          </div>
        ))}
      </div>}
    </div>
  )
}

// Back-to-back follow notifications (the common case — someone posts
// something popular and picks up several new followers within minutes of
// each other) read as noisy clutter one row per follower. Collapses any
// consecutive run of type==='follow' within a day-bucket into a single
// grouped entry ("X followed you + N others"); a follow interrupted by a
// different notification type starts a new run rather than merging across
// it, so the list still reads in real chronological order. Non-follow
// notifications, and lone follows, pass through unchanged.
export function collapseConsecutiveFollows(items: NotifRow[]): (NotifRow | NotifRow[])[] {
  const out: (NotifRow | NotifRow[])[] = []
  let run: NotifRow[] = []
  const flushRun = () => {
    if (run.length === 1) out.push(run[0])
    else if (run.length > 1) out.push(run)
    run = []
  }
  for (const n of items) {
    if (n.type === 'follow') {
      run.push(n)
    } else {
      flushRun()
      out.push(n)
    }
  }
  flushRun()
  return out
}

function NotificationRow({ n, nowMs, onRead, onDelete }: { n: NotifRow; nowMs: number; onRead: () => void; onDelete: () => void }) {
  const customEmojis = useCustomEmojis()
  const Icon = NOTIF_ICONS[n.type] ?? Bell
  const actorName = n.actor?.display_name || n.actor?.username
  const href = notificationHref(n.link)

  // Reaction notifications carry which emoji was used (data.emoji) and
  // pick-result ones carry the leg's team logo (data.team_logo) — shown in
  // the same corner-badge slot the generic type icon used to always
  // occupy, falling back to that icon when there's nothing richer to show
  // (e.g. notifications created before this was added).
  let badge: React.ReactNode = <Icon size={10} className={styles.badgeIcon} />
  if (n.type === 'reaction' && n.data?.emoji) {
    const custom = n.data.emoji.match(/^:([a-z0-9_]+):$/)
    const customEmoji = custom ? customEmojis.find(e => e.code === custom[1]) : null
    badge = customEmoji
      ? <SafeImage src={customEmoji.image_url} alt={n.data.emoji} className={styles.badgeImage} fallback={<span className={styles.badgeText}>{n.data.emoji}</span>} />
      : <span className={styles.badgeText}>{n.data.emoji}</span>
  } else if (n.type === 'pick_result' && n.data?.team_logo) {
    badge = <SafeImage src={n.data.team_logo} alt="" className={styles.teamBadgeImage} fallback={<Icon size={10} className={styles.badgeIcon} />} />
  }

  const inner = (
    <>
      <div className={styles.avatarWrap}>
        <div className={styles.avatar}>
          {(n.actor?.avatar_url || n.data?.avatar_url) && (
            // A player headshot is a portrait photo meant to fill the circle
            // (cover). A team logo (lineup_confirmed) is a flat mark on a
            // square/transparent canvas — cover crops right into the
            // artwork; it needs to shrink to fit inside instead, with a
            // little breathing room so it doesn't touch the circle's edge.
            <SafeImage
              src={n.actor?.avatar_url || n.data?.avatar_url}
              alt=""
              className={n.type === 'lineup_confirmed' ? styles.teamAvatar : styles.avatarImage}
            />
          )}
        </div>
        <div className={styles.typeBadge}>
          {badge}
        </div>
      </div>
      <div className={styles.copy}>
        <p>
          {actorName && <strong>{actorName} </strong>}
          {n.message || n.body || 'interacted with you'}
        </p>
        <time>{timeAgo(n.created_at, nowMs)}</time>
      </div>
      {!n.read && <div className={styles.unreadDot} />}
    </>
  )

  return (
    <div
      className="ss-activity-row"
      data-unread={n.read ? 'false' : 'true'}
      >
      {href ? (
        <Link href={href} onClick={onRead} className={styles.rowContent}>
          {inner}
        </Link>
      ) : (
        <div className={styles.rowContent}>{inner}</div>
      )}
      {(
        <button
          type="button"
          className="ss-activity-dismiss"
          onClick={onDelete}
          aria-label="Dismiss notification"
          >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

// A collapsed run of consecutive follow notifications — same visual
// language as a single NotificationRow (avatar + badge + text row), but the
// avatar is the most recent follower's and the message names them plus how
// many others. Clicking still goes to that most-recent follower's profile;
// dismissing removes every underlying notification in the group at once.
function GroupedFollowRow({ items, nowMs, onRead, onDelete }: { items: NotifRow[]; nowMs: number; onRead: () => void; onDelete: () => void }) {
  const latest = items[0]
  const actorName = latest.actor?.display_name || latest.actor?.username
  const othersCount = items.length - 1
  const anyUnread = items.some(n => !n.read)
  const Icon = NOTIF_ICONS.follow ?? Bell
  const href = notificationHref(latest.link)

  const inner = (
    <>
      <div className={styles.avatarWrap}>
        <div className={styles.avatar}>
          {(latest.actor?.avatar_url || latest.data?.avatar_url) && (
            <SafeImage src={latest.actor?.avatar_url || latest.data?.avatar_url} alt="" className={styles.avatarImage} />
          )}
        </div>
        <div className={styles.typeBadge}>
          <Icon size={10} className={styles.badgeIcon} />
        </div>
      </div>
      <div className={styles.copy}>
        <p>
          {actorName && <strong>{actorName} </strong>}
          and {othersCount} other{othersCount === 1 ? '' : 's'} followed you
        </p>
        <time>{timeAgo(latest.created_at, nowMs)}</time>
      </div>
      {anyUnread && <div className={styles.unreadDot} />}
    </>
  )

  return (
    <div
      className="ss-activity-row"
      data-unread={anyUnread ? 'true' : 'false'}
      >
      {href ? (
        <Link href={href} onClick={onRead} className={styles.rowContent}>
          {inner}
        </Link>
      ) : (
        <div className={styles.rowContent}>{inner}</div>
      )}
      {(
        <button
          type="button"
          className="ss-activity-dismiss"
          onClick={onDelete}
          aria-label="Dismiss notifications"
          >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
