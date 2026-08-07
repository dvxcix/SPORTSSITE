'use client'

import { useDesktopPlatform } from '@/lib/useDesktopPlatform'
import { AnimatePresence, motion } from 'motion/react'
import { Crown, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function DesktopUpgradePrompt({ tier, feature }: { tier: string; feature: string }) {
  const isDesktop = useDesktopPlatform()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isDesktop) return
    const key = `slipsurge.desktop.upsell.${feature}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, 'shown')
      const timer = window.setTimeout(() => setOpen(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [feature, isDesktop])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="ss-desktop-upgrade-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="ss-desktop-upgrade-modal" initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>
            <button onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
            <div className="ss-desktop-upgrade-icon"><Crown size={23} /></div>
            <span>UNLOCK YOUR DESKTOP WORKSPACE</span>
            <h2>{feature} is built for {tier}</h2>
            <p>Upgrade once to unlock this workspace across web, desktop, and your future mobile apps—using the same SlipSurge account.</p>
            <div><button onClick={() => setOpen(false)}>Not now</button><Link href="/pricing"><Sparkles size={14} /> Compare plans</Link></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
