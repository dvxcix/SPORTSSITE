'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Bell, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users, TrendingUp, ClipboardCheck, X, Trash2 } from 'lucide-react'
import { useCustomEmojis } from '@/lib/emoji'

export const NOTIF_ICONS: Record<string, any> = {
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function NotificationsList({ userId, initialNotifications }: { userId: string; initialNotifications: NotifRow[] }) {
  const supabase = createClient()
  const [notifications, setNotifications] = useState(initialNotifications)
  const [clearing, setClearing] = useState(false)

  async function deleteMany(ids: string[]) {
    const prev = notifications
    setNotifications(p => p.filter(n => !ids.includes(n.id)))
    const { error } = await supabase.from('notifications').delete().in('id', ids).eq('user_id', userId)
    if (error) setNotifications(prev) // still in the DB — restore instead of pretending it's gone
  }

  async function clearAll() {
    if (!confirm('Clear all notifications? This can\'t be undone.')) return
    const prev = notifications
    setClearing(true)
    setNotifications([])
    const { error } = await supabase.from('notifications').delete().eq('user_id', userId)
    setClearing(false)
    if (error) setNotifications(prev) // delete didn't happen — don't leave the list looking cleared
  }

  const groups: Record<string, NotifRow[]> = {}
  for (const n of notifications) {
    const diff = Math.floor((Date.now() - new Date(n.created_at).getTime()) / 86400000)
    const key = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This Week' : 'Earlier'
    groups[key] = [...(groups[key] ?? []), n]
  }
  const groupedGroups: Record<string, (NotifRow | NotifRow[])[]> = {}
  for (const [label, items] of Object.entries(groups)) groupedGroups[label] = collapseConsecutiveFollows(items)

  if (notifications.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>🔔</p>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>You're all caught up</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Notifications will appear here</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={clearAll} disabled={clearing} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12, fontWeight: 700,
          color: 'var(--text-3)', cursor: clearing ? 'default' : 'pointer', opacity: clearing ? 0.6 : 1,
          transition: 'all 130ms',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,77,106,0.35)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
          <Trash2 size={12} /> Clear all
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {Object.entries(groupedGroups).map(([label, entries]) => (
          <div key={label}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {label}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entries.map(entry => Array.isArray(entry)
                ? <GroupedFollowRow key={entry[0].id} items={entry} onDelete={() => deleteMany(entry.map(n => n.id))} />
                : <NotificationRow key={entry.id} n={entry} onDelete={() => deleteMany([entry.id])} />
              )}
            </div>
          </div>
        ))}
      </div>
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

function NotificationRow({ n, onDelete }: { n: NotifRow; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  const customEmojis = useCustomEmojis()
  const Icon = NOTIF_ICONS[n.type] ?? Bell
  const actorName = n.actor?.display_name || n.actor?.username

  // Reaction notifications carry which emoji was used (data.emoji) and
  // pick-result ones carry the leg's team logo (data.team_logo) — shown in
  // the same corner-badge slot the generic type icon used to always
  // occupy, falling back to that icon when there's nothing richer to show
  // (e.g. notifications created before this was added).
  let badge: React.ReactNode = <Icon size={10} style={{ color: 'var(--accent)' }} />
  if (n.type === 'reaction' && n.data?.emoji) {
    const custom = n.data.emoji.match(/^:([a-z0-9_]+):$/)
    const customEmoji = custom ? customEmojis.find(e => e.code === custom[1]) : null
    badge = customEmoji
      ? <img src={customEmoji.image_url} alt={n.data.emoji} style={{ width: 11, height: 11, objectFit: 'contain' }} />
      : <span style={{ fontSize: 10, lineHeight: 1 }}>{n.data.emoji}</span>
  } else if (n.type === 'pick_result' && n.data?.team_logo) {
    badge = <img src={n.data.team_logo} alt="" style={{ width: 13, height: 13, objectFit: 'contain' }} />
  }

  const inner = (
    <>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-3)', overflow: 'hidden' }}>
          {(n.actor?.avatar_url || n.data?.avatar_url) && (
            // A player headshot is a portrait photo meant to fill the circle
            // (cover). A team logo (lineup_confirmed) is a flat mark on a
            // square/transparent canvas — cover crops right into the
            // artwork; it needs to shrink to fit inside instead, with a
            // little breathing room so it doesn't touch the circle's edge.
            <img
              src={n.actor?.avatar_url || n.data?.avatar_url}
              alt=""
              style={{
                width: '100%', height: '100%', boxSizing: 'border-box',
                objectFit: n.type === 'lineup_confirmed' ? 'contain' : 'cover',
                padding: n.type === 'lineup_confirmed' ? 6 : 0,
              }}
            />
          )}
        </div>
        <div style={{
          position: 'absolute', bottom: -3, right: -3, width: 18, height: 18, borderRadius: '50%',
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {badge}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.45 }}>
          {actorName && <span style={{ fontWeight: 800 }}>{actorName} </span>}
          {n.message || n.body || 'interacted with you'}
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{timeAgo(n.created_at)}</p>
      </div>
      {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />}
    </>
  )

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 40px 12px 12px',
        borderRadius: 'var(--radius)', border: n.read ? '1px solid transparent' : '1px solid var(--border)',
        background: n.read ? 'transparent' : 'var(--surface-2)', transition: 'background 130ms',
      }}>
      {n.link ? (
        <Link href={n.link} style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
          {inner}
        </Link>
      ) : (
        <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>{inner}</div>
      )}
      {hovered && (
        <button
          onClick={onDelete}
          aria-label="Dismiss notification"
          style={{
            position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: '50%',
            background: 'var(--surface-3)', border: 'none', color: 'var(--text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}>
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
function GroupedFollowRow({ items, onDelete }: { items: NotifRow[]; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  const latest = items[0]
  const actorName = latest.actor?.display_name || latest.actor?.username
  const othersCount = items.length - 1
  const anyUnread = items.some(n => !n.read)
  const Icon = NOTIF_ICONS.follow ?? Bell

  const inner = (
    <>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-3)', overflow: 'hidden' }}>
          {(latest.actor?.avatar_url || latest.data?.avatar_url) && (
            <img src={latest.actor?.avatar_url || latest.data?.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{
          position: 'absolute', bottom: -3, right: -3, width: 18, height: 18, borderRadius: '50%',
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={10} style={{ color: 'var(--accent)' }} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.45 }}>
          {actorName && <span style={{ fontWeight: 800 }}>{actorName} </span>}
          and {othersCount} other{othersCount === 1 ? '' : 's'} followed you
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{timeAgo(latest.created_at)}</p>
      </div>
      {anyUnread && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />}
    </>
  )

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 40px 12px 12px',
        borderRadius: 'var(--radius)', border: anyUnread ? '1px solid var(--border)' : '1px solid transparent',
        background: anyUnread ? 'var(--surface-2)' : 'transparent', transition: 'background 130ms',
      }}>
      {latest.link ? (
        <Link href={latest.link} style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
          {inner}
        </Link>
      ) : (
        <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>{inner}</div>
      )}
      {hovered && (
        <button
          onClick={onDelete}
          aria-label="Dismiss notifications"
          style={{
            position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: '50%',
            background: 'var(--surface-3)', border: 'none', color: 'var(--text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}>
          <X size={13} />
        </button>
      )}
    </div>
  )
}
