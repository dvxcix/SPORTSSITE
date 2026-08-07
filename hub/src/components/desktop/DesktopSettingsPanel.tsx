'use client'

import { useDesktopPlatform } from '@/lib/useDesktopPlatform'
import { sendDesktopNotification } from '@/lib/desktopNotifications'
import { BellRing, MonitorCog, PlayCircle, Radio } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export function DesktopSettingsPanel() {
  const isDesktop = useDesktopPlatform()
  const [status, setStatus] = useState('')
  if (!isDesktop) return null

  async function testAlerts() {
    setStatus('Requesting permission…')
    const sent = await sendDesktopNotification('SlipSurge desktop alerts are live', 'Line movement, picks, and community alerts can now reach this device.')
    localStorage.setItem('slipsurge.desktop.notifications', sent ? '1' : '0')
    setStatus(sent ? 'Enabled — test alert sent.' : 'Permission was not granted.')
  }

  function replayTour() {
    localStorage.removeItem('slipsurge.desktop.tour.v1')
    window.dispatchEvent(new Event('slipsurge:desktop-tour'))
  }

  return (
    <section className="ss-desktop-settings-panel">
      <div className="ss-desktop-settings-heading">
        <div><MonitorCog size={19} /></div>
        <div><span>DESKTOP APP</span><h2>SlipSurge for this device</h2></div>
        <i>Native</i>
      </div>
      <div className="ss-desktop-settings-actions">
        <button onClick={testAlerts}><BellRing size={16} /><span><strong>Desktop alerts</strong><small>{status || 'Enable and send a test notification'}</small></span></button>
        <button onClick={replayTour}><PlayCircle size={16} /><span><strong>Replay feature guide</strong><small>See the desktop introduction again</small></span></button>
        <Link href="/channels"><Radio size={16} /><span><strong>SlipSurge Live</strong><small>Open the community workspace</small></span></Link>
      </div>
    </section>
  )
}
