'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Hash, MessagesSquare, Users } from 'lucide-react'

const destinations = [
  { href: '/channels', label: 'Live', icon: MessagesSquare },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/forum', label: 'Discussions', icon: Hash },
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
