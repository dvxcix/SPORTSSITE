'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, LockKeyhole, MessageCircle, Search, Users } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import { sportLogoUrl } from '@/lib/sportLogos'
import { communityCollections, communityMatches, type CommunityCollection } from '@/lib/communityCollections'
import type { CommunityDirectoryEntry } from '@/lib/creatorCommunityDirectory'
import styles from './CommunityDirectory.module.css'

export function CommunityDirectory({ groups, joinedIds, userId, invitations, variant = 'directory' }: { variant?: 'directory' | 'storefront'; groups: CommunityDirectoryEntry[]; joinedIds: string[]; userId: string | null; invitations: CommunityDirectoryEntry[] }) {
  const [search, setSearch] = useState(''), [access, setAccess] = useState('all'), [sport, setSport] = useState('all')
  const joined = useMemo(() => new Set(joinedIds), [joinedIds])
  const collections = useMemo(() => communityCollections(groups, joinedIds, userId, invitations), [groups, joinedIds, userId, invitations])
  const [view, setView] = useState<'yours' | 'discover'>(() => collections.some(item => item.joined) ? 'yours' : 'discover')
  const yours = collections.filter(item => item.joined), discover = collections.filter(item => !item.joined && item.spaces.some(group => group.is_public || group.access_type === 'paid'))
  const filtered = (view === 'yours' ? yours : discover).filter(item => item.spaces.some(group => communityMatches(group, search, access, sport)))
  const href = (group: CommunityDirectoryEntry) => group.access_type === 'paid' && !joined.has(group.id) && group.owner_id !== userId && group.creator_product_id && !group.invitationId ? `/creators/offers/${group.creator_product_id}` : `/groups/${group.slug}`
  const accessLabel = (group: CommunityDirectoryEntry) => group.invitationId ? 'View invitation' : group.owner_id === userId || joined.has(group.id) ? 'Open community' : group.access_type === 'paid' ? group.price == null ? 'View membership' : `$${group.price.toFixed(2)} / ${group.billing_period_days || 30} days` : 'Join free'
  const card = (collection: CommunityCollection) => {
    const group = collection.spaces.find(item => communityMatches(item, search, access, sport)) ?? collection.primary
    const member = group.owner_id === userId || joined.has(group.id)
    return <article key={collection.id} className={styles.card} data-community-owner={collection.id}>
      <div className={styles.cover} data-has-cover={Boolean(group.banner_url)}>{group.banner_url && <SafeImage src={group.banner_url} alt="" />}</div>
      <div className={styles.cardBody}>
        <div className={styles.avatar}><SafeImage src={group.avatar_url} alt="" fallback={group.emoji || <Users size={23} />} /></div>
        {member && <span className={styles.member}><Check size={12} />{group.owner_id === userId ? 'Your community' : 'Joined'}</span>}
        <h2><Link href={href(group)}>{group.name}</Link></h2>
        {group.description && <p className={styles.description}>{group.description}</p>}
        <div className={styles.meta}>{group.sport && <span>{sportLogoUrl(group.sport) && <SafeImage src={sportLogoUrl(group.sport)} alt="" />}{group.sport}</span>}{collection.spaces.length === 1 && <span><Users size={13} />{group.member_count ?? 0} {(group.member_count ?? 0) === 1 ? 'member' : 'members'}</span>}{group.access_type === 'paid' && <span><LockKeyhole size={12} />Membership</span>}</div>
        <div className={styles.actions}><Link href={href(group)}>{accessLabel(group)}<ArrowRight size={15} /></Link>{member && <Link className={styles.chat} href={`/groups/${group.slug}?view=chat`} aria-label={`Open ${group.name} chat`}><MessageCircle size={17} /></Link>}</div>
        {collection.spaces.length > 1 && <details className={styles.spaces}><summary>{collection.spaces.length} spaces<ChevronDown size={15} /></summary><nav aria-label={`${group.name} memberships and spaces`}>{collection.spaces.map(space => <Link key={space.id} href={href(space)}><span><strong>{space.name}</strong><small>{space.invitationId ? 'Invitation pending' : space.access_type === 'paid' ? 'Member access' : space.is_public ? 'Free community' : 'Private community'}</small></span><span>{joined.has(space.id) || space.owner_id === userId ? <Check size={14} /> : <ArrowRight size={14} />}</span></Link>)}</nav></details>}
      </div>
    </article>
  }
  if (variant === 'storefront') return <div className={styles.grid}>{collections.map(card)}</div>
  return <div className={styles.directory}>
    <div className={styles.toolbar}><div className={styles.tabs} aria-label="Community lists">{(['yours', 'discover'] as const).map(item => <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item === 'yours' ? 'Your communities' : 'Discover'}<span>{item === 'yours' ? yours.length : discover.length}</span></button>)}</div><label className={styles.search}><Search size={17} /><input aria-label="Find communities" placeholder="Find a community" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Community access" value={access} onChange={event => setAccess(event.target.value)}><option value="all">Free & paid</option><option value="free">Free</option><option value="paid">Paid</option></select><select aria-label="Community sport" value={sport} onChange={event => setSport(event.target.value)}><option value="all">All sports</option>{[...new Set(groups.map(group => group.sport?.toUpperCase()).filter((value): value is string => !!value))].sort().map(value => <option key={value}>{value}</option>)}</select></div>
    <section aria-label={view === 'yours' ? 'Your communities' : 'Discover communities'}><div className={styles.grid}>{filtered.map(card)}</div>{!filtered.length && <div className={styles.empty}><Users size={26} /><h2>{search || access !== 'all' || sport !== 'all' ? 'No communities match' : view === 'yours' ? 'Your communities live here' : 'Find your next community'}</h2><p>{search || access !== 'all' || sport !== 'all' ? 'Try another search or clear your filters.' : view === 'yours' ? 'Join a creator for their posts, picks and member chat.' : 'Explore creators and their memberships.'}</p>{search || access !== 'all' || sport !== 'all' ? <button type="button" onClick={() => { setSearch(''); setAccess('all'); setSport('all') }}>Clear filters</button> : view === 'yours' ? <button type="button" onClick={() => setView('discover')}>Discover communities</button> : <Link href="/creators">Explore creators<ArrowRight size={15} /></Link>}</div>}</section>
  </div>
}
