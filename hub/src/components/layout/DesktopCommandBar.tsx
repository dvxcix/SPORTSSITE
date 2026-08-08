'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  DatabaseZap,
  FlaskConical,
  Home,
  RefreshCw,
  Search,
  Table2,
  Wifi,
  WifiOff,
} from 'lucide-react'

const workspaces = [
  { href: '/dugout', label: 'Dugout', icon: FlaskConical },
  { href: '/batter-cost', label: 'Batter Cost', icon: DatabaseZap },
  { href: '/slate-breakdown', label: 'Slate', icon: Table2 },
]

export function DesktopCommandBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const markOnline = () => setOnline(true)
    const markOffline = () => setOnline(false)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('slipsurge:focus-search'))
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        window.location.reload()
      } else if (event.key === '[') {
        event.preventDefault()
        router.back()
      } else if (event.key === ']') {
        event.preventDefault()
        router.forward()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  return (
    <div className="ss-desktop-commandbar" role="toolbar" aria-label="Desktop navigation">
      <div className="ss-desktop-history">
        <button type="button" onClick={() => router.back()} aria-label="Go back" title="Back (Ctrl+[)">
          <ArrowLeft size={14} />
        </button>
        <button type="button" onClick={() => router.forward()} aria-label="Go forward" title="Forward (Ctrl+])">
          <ArrowRight size={14} />
        </button>
        <button type="button" onClick={() => window.location.reload()} aria-label="Reload" title="Reload (Ctrl+R)">
          <RefreshCw size={13} />
        </button>
        <Link href="/feed" aria-label="Open feed" title="Feed">
          <Home size={13} />
        </Link>
      </div>

      <div className="ss-desktop-workspaces" aria-label="Workspaces">
        {workspaces.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link key={item.href} href={item.href} data-active={active}>
              <Icon size={13} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>

      <button
        type="button"
        className="ss-desktop-search-command"
        onClick={() => window.dispatchEvent(new CustomEvent('slipsurge:focus-search'))}
        title="Search SlipSurge (Ctrl+K)"
      >
        <Search size={13} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="ss-desktop-connection" data-online={online} title={online ? 'Connected' : 'Offline'}>
        {online ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>{online ? 'Live' : 'Offline'}</span>
      </div>
    </div>
  )
}
