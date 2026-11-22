'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'
import { Bell, Bookmark, CalendarDays, Hash, Home, LayoutGrid, MessageCircle, MessagesSquare, Newspaper, Sparkles, Users } from 'lucide-react'

const destinations = [
  { href: '/community', label: 'Community', icon: Sparkles },
  { href: '/feed', label: 'Feed', icon: Home },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/channels', label: 'Live rooms', icon: MessagesSquare },
  { href: '/forum', label: 'Discussions', icon: Hash },
  { href: '/pages', label: 'Pages', icon: LayoutGrid },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/notifications', label: 'Activity', icon: Bell },
  { href: '/bookmarks', label: 'Saved', icon: Bookmark },
  { href: '/blog', label: 'Articles', icon: Newspaper },
]

export function CommunityNav() {
  const pathname = usePathname()
  const nav = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const container = nav.current
    if (!container) return
    const reveal = () => {
      const active = container.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) return
      const item = active.getBoundingClientRect(), rail = container.getBoundingClientRect()
      if (item.left < rail.left + 4 || item.right > rail.right - 4) container.scrollLeft += item.left - rail.left - 8
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(container)
    return () => observer.disconnect()
  }, [pathname])
  return <nav ref={nav} className="ss-community-nav" aria-label="Community">
    {destinations.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`)
      return <Link key={href} href={href} className={active ? 'is-active' : undefined} aria-current={active ? 'page' : undefined}>
        <Icon size={15} aria-hidden="true" /><span>{label}</span>
      </Link>
    })}
  </nav>
}
