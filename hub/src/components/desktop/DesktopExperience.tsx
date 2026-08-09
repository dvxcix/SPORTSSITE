'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { DESKTOP_NOTIFICATIONS_KEY, ensureDesktopNotificationPermission, sendDesktopNotification } from '@/lib/desktopNotifications'
import { SETTINGS_KEY_BY_TYPE, type NotificationType } from '@/lib/notify'
import {
  BellRing, ChevronRight, DatabaseZap, FlaskConical,
  MessageCircle, Table2, X, Zap,
} from 'lucide-react'

const TOUR_KEY = 'slipsurge.desktop.tour.v1'
const NOTIFICATION_CURSOR_PREFIX = 'slipsurge.desktop.notifications.cursor.'

const features = [
  { icon: FlaskConical, name: 'The Dugout', copy: 'Live matchup intelligence, matrices and watchlists in one workspace.', tier: 'Ultimate' },
  { icon: DatabaseZap, name: 'Batter Cost', copy: 'Follow opening prices, intraday movement and market discrepancies.', tier: 'Ultimate' },
  { icon: Table2, name: 'Slate Breakdown', copy: 'Compare every pitcher and lineup without juggling browser tabs.', tier: 'Advanced' },
  { icon: MessageCircle, name: 'Surge Live', copy: 'Real-time rooms, direct messages and community alerts built into desktop.', tier: 'Basic' },
]

type DesktopNotificationRow = {
  id: string
  actor_id?: string | null
  type: NotificationType
  message?: string | null
  body?: string | null
  link?: string | null
  data?: { avatar_url?: string; team_logo?: string } | null
  created_at: string
}

const NOTIFICATION_TITLES: Partial<Record<NotificationType, string>> = {
  follow: 'New follower', reaction: 'New reaction', comment: 'New comment', mention: 'You were mentioned',
  pick_result: 'Pick graded', subscription: 'Subscription update', message: 'New message', repost: 'New repost',
  group_invite: 'Group invitation', new_pick: 'New pick posted', lineup_confirmed: 'Lineup confirmed',
}

async function presentAccountNotification(row: DesktopNotificationRow, userId: string) {
  const supabase = createClient()
  let actor: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null = null
  if (row.actor_id) {
    const result = await supabase.from('users').select('display_name,username,avatar_url').eq('id', row.actor_id).maybeSingle()
    actor = result.data
  }
  const actorName = actor?.display_name || actor?.username || ''
  let body = `${actorName ? `${actorName} ` : ''}${row.message || row.body || 'sent you an update'}`.trim()
  let count = 1
  if (row.type === 'follow') {
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    const recent = await supabase.from('notifications').select('id').eq('user_id', userId).eq('type', 'follow').gte('created_at', since)
    count = Math.max(1, recent.data?.length ?? 1)
    if (count > 1) body = `${actorName || 'Someone'} and ${count - 1} other${count === 2 ? '' : 's'} followed you`
  }
  const imageUrl = actor?.avatar_url || row.data?.avatar_url || row.data?.team_logo
  await sendDesktopNotification(NOTIFICATION_TITLES[row.type] || 'SlipSurge', body, {
    group: row.type === 'follow' ? 'social-follows' : `slipsurge-${row.type}`,
    summary: count > 1 ? `${count} recent followers` : undefined,
    icon: imageUrl || undefined,
    extra: { link: row.link || '/notifications', imageUrl: imageUrl || null, notificationId: row.id, type: row.type },
  })
}

export function DesktopExperience() {
  const { user, profile } = useAuth()
  const [tourOpen, setTourOpen] = useState(false)
  const [notificationState, setNotificationState] = useState<'idle' | 'working' | 'on' | 'denied'>('idle')
  const [notificationError, setNotificationError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTourOpen(window.localStorage.getItem(TOUR_KEY) !== 'complete')
      if (window.localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === '1') setNotificationState('on')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!user || window.localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) !== '1') return
    const supabase = createClient()
    const cursorKey = `${NOTIFICATION_CURSOR_PREFIX}${user.id}`
    let catchingUp = false

    const deliver = async (row: DesktopNotificationRow) => {
      const settingKey = SETTINGS_KEY_BY_TYPE[row.type]
      if (!settingKey || profile?.notification_settings?.[settingKey] !== false) await presentAccountNotification(row, user.id)
      window.localStorage.setItem(cursorKey, row.created_at || new Date().toISOString())
    }

    const catchUp = async () => {
      if (catchingUp) return
      const cursor = window.localStorage.getItem(cursorKey)
      if (!cursor) {
        window.localStorage.setItem(cursorKey, new Date().toISOString())
        return
      }
      catchingUp = true
      try {
        const { data, error } = await supabase.from('notifications')
          .select('id,actor_id,type,message,body,link,data,created_at')
          .eq('user_id', user.id).gt('created_at', cursor)
          .order('created_at', { ascending: true }).limit(20)
        if (error) throw error
        for (const row of (data ?? []) as DesktopNotificationRow[]) await deliver(row)
      } catch (error) {
        console.error('[desktop] notification catch-up failed', error)
      } finally {
        catchingUp = false
      }
    }

    const channel = supabase.channel(`desktop-notifications:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}`,
      }, payload => {
        const row = payload.new as DesktopNotificationRow
        void deliver(row)
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void catchUp() })
    const resume = () => { if (document.visibilityState === 'visible') void catchUp() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      void supabase.removeChannel(channel)
    }
  }, [user, profile?.notification_settings])

  useEffect(() => {
    let listener: { unregister: () => void } | undefined
    void import('@tauri-apps/plugin-notification').then(async notifications => {
      listener = await notifications.onAction(notification => {
        const link = notification.extra?.link
        if (typeof link === 'string' && link.startsWith('/')) window.location.assign(link)
      })
    }).catch(error => console.error('[desktop] notification action listener failed', error))
    return () => listener?.unregister()
  }, [])

  useEffect(() => {
    const replay = () => setTourOpen(true)
    window.addEventListener('slipsurge:desktop-tour', replay)
    return () => window.removeEventListener('slipsurge:desktop-tour', replay)
  }, [])

  function finishTour() {
    window.localStorage.setItem(TOUR_KEY, 'complete')
    setTourOpen(false)
  }

  async function turnOnNotifications() {
    setNotificationState('working')
    setNotificationError('')
    const permission = await ensureDesktopNotificationPermission()
    if (!permission.ok) {
      setNotificationState('denied')
      setNotificationError(permission.message)
      return
    }
    const result = await sendDesktopNotification('SlipSurge notifications are live', 'Line movement, replies and community alerts can now reach this desktop.')
    setNotificationState(result.ok ? 'on' : 'denied')
    if (!result.ok) setNotificationError(result.message)
  }

  return (
    <>
      <AnimatePresence>
        {tourOpen && (
          <motion.div className="ss-desktop-tour-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section
              className="ss-desktop-tour"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              aria-modal="true"
              role="dialog"
              aria-labelledby="desktop-tour-title"
            >
              <button type="button" className="ss-desktop-tour-close" onClick={finishTour} aria-label="Close desktop guide"><X size={17} /></button>
              <div className="ss-desktop-tour-brand">
                <motion.div animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }} transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2.4 }}>
                  <img src="/logo.png" alt="" />
                </motion.div>
                <div>
                  <span>SLIPSURGE DESKTOP</span>
                  <h1 id="desktop-tour-title">Your command center is ready.</h1>
                </div>
              </div>
              <p className="ss-desktop-tour-intro">Built for faster research, persistent live rooms and alerts that do not disappear inside another browser tab.</p>

              <div className="ss-desktop-tour-grid">
                {features.map((feature, index) => {
                  const Icon = feature.icon
                  return (
                    <motion.div key={feature.name} className="ss-desktop-feature" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * index }}>
                      <div className="ss-desktop-feature-icon"><Icon size={18} /></div>
                      <div><strong>{feature.name}</strong><p>{feature.copy}</p></div>
                      <span>{feature.tier}</span>
                    </motion.div>
                  )
                })}
              </div>

              <div className="ss-desktop-tour-actions">
                <button type="button" onClick={turnOnNotifications} disabled={notificationState === 'working' || notificationState === 'on'}>
                  <BellRing size={15} />
                  {notificationState === 'on' ? 'Notifications enabled' : notificationState === 'working' ? 'Requesting...' : notificationState === 'denied' ? 'Try desktop alerts again' : 'Enable desktop alerts'}
                </button>
                <Link href="/pricing" onClick={finishTour}><Zap size={15} /> Explore plans</Link>
                <button type="button" className="ss-desktop-tour-primary" onClick={finishTour}>Enter SlipSurge <ChevronRight size={16} /></button>
              </div>
              {notificationError && <p className="ss-desktop-notification-error" role="alert">{notificationError}</p>}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
