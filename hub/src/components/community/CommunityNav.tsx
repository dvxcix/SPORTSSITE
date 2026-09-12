'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  return <nav className="ss-community-nav" aria-label="Community">
    {destinations.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`)
      return <Link key={href} href={href} className={active ? 'is-active' : undefined} aria-current={active ? 'page' : undefined}>
        <Icon size={15} aria-hidden="true" /><span>{label}</span>
      </Link>
    })}
  </nav>
}
