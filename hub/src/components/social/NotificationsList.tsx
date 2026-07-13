'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Bell, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users, TrendingUp, X, Trash2 } from 'lucide-react'

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
}

export type NotifRow = {
  id: string; type: string; message: string | null; body: string | null
  link: string | null; read: boolean; created_at: string
  actor?: { username: string; display_name?: string; avatar_url?: string } | null
  data?: { avatar_url?: string } | null
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

  async function deleteOne(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id).eq('user_id', userId)
  }

  async function clearAll() {
    if (!confirm('Clear all notifications? This can\'t be undone.')) return
    setClearing(true)
    setNotifications([])
    await supabase.from('notifications').delete().eq('user_id', userId)
    setClearing(false)
  }

  const groups: Record<string, NotifRow[]> = {}
  for (const n of notifications) {
    const diff = Math.floor((Date.now() - new Date(n.created_at).getTime()) / 86400000)
    const key = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This Week' : 'Earlier'
    groups[key] = [...(groups[key] ?? []), n]
  }

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
        {Object.entries(groups).map(([label, items]) => (
          <div key={label}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {label}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(n => (
                <NotificationRow key={n.id} n={n} onDelete={() => deleteOne(n.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NotificationRow({ n, onDelete }: { n: NotifRow; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false)
  const Icon = NOTIF_ICONS[n.type] ?? Bell
  const actorName = n.actor?.display_name || n.actor?.username

  const inner = (
    <>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-3)', overflow: 'hidden' }}>
          {(n.actor?.avatar_url || n.data?.avatar_url) && (
            <img src={n.actor?.avatar_url || n.data?.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
