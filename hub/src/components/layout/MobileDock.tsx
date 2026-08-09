'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChartSpline, FlaskConical, Home, Menu, MessagesSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/feed', label: 'Home', icon: Home },
  { href: '/dugout', label: 'Research', icon: FlaskConical },
  { href: '/odds-terminal', label: 'Terminal', icon: ChartSpline },
  { href: '/channels', label: 'Live', icon: MessagesSquare },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileDock({ onMenuClick, hidden = false }: { onMenuClick: () => void; hidden?: boolean }) {
  const pathname = usePathname()

  return (
    <nav className="ss-mobile-dock md:hidden" data-hidden={hidden} aria-label="Primary navigation" aria-hidden={hidden}>
      <div className="ss-mobile-dock-surface">
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <Link key={item.href} href={item.href} className={cn('ss-mobile-dock-item', active && 'is-active')} aria-current={active ? 'page' : undefined} data-label={item.label}>
              <span className="ss-mobile-dock-icon"><Icon size={18} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" /></span>
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button type="button" className="ss-mobile-dock-item" onClick={onMenuClick} aria-label="Open all navigation">
          <span className="ss-mobile-dock-icon"><Menu size={19} aria-hidden="true" /></span>
          <span>More</span>
        </button>
      </div>
    </nav>
  )
}
