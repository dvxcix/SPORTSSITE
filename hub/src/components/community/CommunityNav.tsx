'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import { ArrowLeft, Bell, Bookmark, CalendarDays, Hash, Home, LayoutGrid, MessageCircle, MessagesSquare, MoreHorizontal, Newspaper, Users } from 'lucide-react'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import styles from './CommunityNav.module.css'

const destinations = [
  { href: '/feed', label: 'Feed', icon: Home },
  { href: '/groups', label: 'Communities', icon: Users },
  { href: '/channels', label: 'Live rooms', icon: MessagesSquare },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
]
const secondary = [
  { href: '/bookmarks', label: 'Saved posts', icon: Bookmark },
  { href: '/notifications', label: 'Activity', icon: Bell },
  { href: '/forum', label: 'Discussions', icon: Hash },
  { href: '/pages', label: 'Pages', icon: LayoutGrid },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/blog', label: 'Articles', icon: Newspaper },
]
export function CommunityMore() {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null)
  return <><button ref={anchor} type="button" className={styles.more} aria-label="More community options" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}><MoreHorizontal size={18} /><span>More</span></button><FloatingSurface open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={240} align="end" ariaLabel="More community options"><nav className={styles.menu} aria-label="More community options">{secondary.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={() => setOpen(false)}><Icon size={16} />{label}</Link>)}</nav></FloatingSurface></>
}
/** Desktop already has these destinations in its top bar. Mobile gets one compact row. */
export function CommunityNav() {
  const pathname = usePathname()
  const root = destinations.some(item => pathname === item.href) || pathname === '/community'
  if (!root) return <nav className={styles.context} aria-label="Community"><Link href="/groups"><ArrowLeft size={15} />Communities</Link><CommunityMore /></nav>
  return <nav className={styles.mobile} aria-label="Community">{destinations.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon size={17} /><span>{label}</span></Link>)}</nav>
}
