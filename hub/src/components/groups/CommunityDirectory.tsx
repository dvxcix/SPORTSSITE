'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, LockKeyhole, Search, Users } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import type { CommunityDirectoryEntry } from '@/lib/creatorCommunityDirectory'
import styles from './CommunityDirectory.module.css'

export function CommunityDirectory({groups,joinedIds,userId,invitations}:{groups:CommunityDirectoryEntry[];joinedIds:string[];userId:string|null;invitations:CommunityDirectoryEntry[]}) {
 const [search,setSearch]=useState(''),[access,setAccess]=useState('all'),[sport,setSport]=useState('all')
 const joined=useMemo(()=>new Set(joinedIds),[joinedIds])
 const filtered=groups.filter(group=>(`${group.name} ${group.description||''}`).toLowerCase().includes(search.trim().toLowerCase())&&(access==='all'||(group.access_type||'free')===access)&&(sport==='all'||group.sport?.toUpperCase()===sport))
 const yours=filtered.filter(group=>group.owner_id===userId||joined.has(group.id)),discover=filtered.filter(group=>group.owner_id!==userId&&!joined.has(group.id)&&(group.is_public||group.access_type==='paid'))
 const card=(group:CommunityDirectoryEntry)=>{
  const owned=group.owner_id===userId,member=joined.has(group.id)
  const paid=group.access_type==='paid'
  const href=paid&&!member&&!owned&&group.creator_product_id&&!group.invitationId?`/creators/offers/${group.creator_product_id}`:`/groups/${group.slug}`
  return <Link key={group.id} href={href} className={styles.card}><div className={styles.avatar}><SafeImage src={group.avatar_url} alt="" fallback={group.emoji||'⚡'}/></div><div className={styles.identity}><div className={styles.name}><h3>{group.name}</h3><ArrowUpRight size={16}/></div><p>{group.description||'Community posts, picks and conversations.'}</p><div className={styles.meta}><span><Users size={13}/>{group.member_count??0}</span>{group.sport&&<span>{group.sport}</span>}<span>{owned?'Your community':group.invitationId?'Invitation':member?'Joined':paid?<><LockKeyhole size={12}/>{group.price==null?'Paid membership':`$${group.price.toFixed(2)}${group.product_type==='membership'?` / ${group.billing_period_days||30} days`:' · one time'}`}</>:'Free'}</span></div></div></Link>
 }
 return <div className={styles.directory}>
  <div className={styles.filters}><label className={styles.search}><Search size={17}/><input aria-label="Find communities" placeholder="Find a community" value={search} onChange={event=>setSearch(event.target.value)}/></label><select aria-label="Community access" value={access} onChange={event=>setAccess(event.target.value)}><option value="all">Free & paid</option><option value="free">Free</option><option value="paid">Paid</option></select><select aria-label="Community sport" value={sport} onChange={event=>setSport(event.target.value)}><option value="all">All sports</option>{[...new Set(groups.map(group=>group.sport?.toUpperCase()).filter((value):value is string=>!!value))].sort().map(value=><option key={value} value={value}>{value}</option>)}</select></div>
  {!!invitations.length&&<section aria-labelledby="community-invitations"><h2 id="community-invitations">Invitations <span>{invitations.length}</span></h2><div className={styles.grid}>{invitations.map(card)}</div></section>}
  {!!yours.length&&<section aria-labelledby="your-communities"><h2 id="your-communities">Your communities <span>{yours.length}</span></h2><div className={styles.grid}>{yours.map(card)}</div></section>}
  <section aria-labelledby="discover-communities"><h2 id="discover-communities">Discover <span>{discover.length}</span></h2><div className={styles.grid}>{discover.map(card)}</div>{!discover.length&&<div className={styles.empty}><Users size={24}/><h3>{search||access!=='all'||sport!=='all'?'No communities match':'Communities are getting started'}</h3><p>{search||access!=='all'||sport!=='all'?'Try another search or clear your filters.':'Explore creators or start a free community of your own.'}</p>{search||access!=='all'||sport!=='all'?<button type="button" onClick={()=>{setSearch('');setAccess('all');setSport('all')}}>Clear filters</button>:<Link href="/creators">Explore creators</Link>}</div>}</section>
 </div>
}
