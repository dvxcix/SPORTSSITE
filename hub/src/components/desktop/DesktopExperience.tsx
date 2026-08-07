'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import {
  BellRing, ChevronRight, Crown, DatabaseZap, FlaskConical,
  MessageCircle, Settings2, Sparkles, Table2, X, Zap,
} from 'lucide-react'

const TOUR_KEY = 'slipsurge.desktop.tour.v1'

const features = [
  { icon: FlaskConical, name: 'The Dugout', copy: 'Live matchup intelligence, matrices and watchlists in one workspace.', tier: 'Ultimate' },
  { icon: DatabaseZap, name: 'Batter Cost', copy: 'Follow opening prices, intraday movement and market discrepancies.', tier: 'Ultimate' },
  { icon: Table2, name: 'Slate Breakdown', copy: 'Compare every pitcher and lineup without juggling browser tabs.', tier: 'Advanced' },
  { icon: MessageCircle, name: 'Surge Live', copy: 'Real-time rooms, direct messages and community alerts built into desktop.', tier: 'Basic' },
]

async function enableNativeNotifications() {
  const notifications = await import('@tauri-apps/plugin-notification')
  let permission = await notifications.isPermissionGranted()
  if (!permission) permission = (await notifications.requestPermission()) === 'granted'
  if (!permission) return false
  notifications.sendNotification({
    title: 'SlipSurge notifications are live',
    body: 'Line movement, replies and community alerts can now reach this desktop.',
  })
  window.localStorage.setItem('slipsurge.desktop.notifications', '1')
  return true
}

export function DesktopExperience() {
  const [tourOpen, setTourOpen] = useState(false)
  const [notificationState, setNotificationState] = useState<'idle' | 'working' | 'on' | 'denied'>('idle')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTourOpen(window.localStorage.getItem(TOUR_KEY) !== 'complete')
      if (window.localStorage.getItem('slipsurge.desktop.notifications') === '1') setNotificationState('on')
    }, 0)
    return () => window.clearTimeout(timer)
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
    try {
      setNotificationState(await enableNativeNotifications() ? 'on' : 'denied')
    } catch (error) {
      console.error('[desktop] native notifications failed', error)
      setNotificationState('denied')
    }
  }

  return (
    <>
      <nav className="ss-desktop-dock" aria-label="SlipSurge desktop tools">
        <Link href="/channels" title="Surge Live"><MessageCircle size={17} /><span>Live</span></Link>
        <Link href="/notifications" title="Notifications"><BellRing size={17} /><span>Alerts</span></Link>
        <button type="button" onClick={() => setTourOpen(true)} title="Feature guide"><Sparkles size={17} /><span>Guide</span></button>
        <Link href="/pricing" className="ss-desktop-dock-upgrade" title="Upgrade SlipSurge"><Crown size={17} /><span>Upgrade</span></Link>
        <Link href="/settings" title="Desktop settings"><Settings2 size={17} /><span>Settings</span></Link>
      </nav>

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
                  {notificationState === 'on' ? 'Notifications enabled' : notificationState === 'working' ? 'Requesting…' : notificationState === 'denied' ? 'Permission blocked' : 'Enable desktop alerts'}
                </button>
                <Link href="/pricing" onClick={finishTour}><Zap size={15} /> Explore plans</Link>
                <button type="button" className="ss-desktop-tour-primary" onClick={finishTour}>Enter SlipSurge <ChevronRight size={16} /></button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
