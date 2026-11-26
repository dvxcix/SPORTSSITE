'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import { ArrowLeft, Bell, Bookmark, Home, MessageCircle, MessagesSquare, MoreHorizontal, Users } from 'lucide-react'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import styles from './CommunityNav.module.css'

const destinations = [
  { href: '/feed', label: 'Feed', icon: Home },
  { href: '/groups', label: 'Communities', icon: Users },
  { href: '/channels', label: 'Live rooms', icon: MessagesSquare },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
]
const secondary = [
  { href: '/channels', label: 'Live rooms', icon: MessagesSquare },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/bookmarks', label: 'Saved posts', icon: Bookmark },
  { href: '/notifications', label: 'Activity', icon: Bell },
]
export function CommunityMore() {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  return <><button ref={anchor} type="button" className={styles.more} aria-label="More community options" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}><MoreHorizontal size={18} aria-hidden="true" /><span>More</span></button><FloatingSurface open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={264} align="end" ariaLabel="More community options"><nav className={styles.menu} aria-label="More community options">{secondary.map(({ href, label, icon: Icon }) => <Link href={href} key={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined} onClick={() => setOpen(false)}><Icon size={16} aria-hidden="true" />{label}</Link>)}</nav></FloatingSurface></>
}
/** The main shell owns primary navigation; nested pages only need their return path. */
export function CommunityNav() {
  const pathname = usePathname()
  const root = destinations.some(item => pathname === item.href) || pathname === '/community'
  const back = pathname.startsWith('/messages/') ? { href: '/messages', label: 'Messages' }
    : pathname.startsWith('/channels/') ? { href: '/channels', label: 'Live rooms' }
    : pathname.startsWith('/groups/') && pathname.endsWith('/settings') ? { href: pathname.slice(0, -'/settings'.length), label: 'Back to community' }
    : { href: '/groups', label: 'Communities' }
  if (!root) return <nav className={styles.context} aria-label="Community"><Link href={back.href}><ArrowLeft size={15} aria-hidden="true" />{back.label}</Link><CommunityMore /></nav>
  return null
}
