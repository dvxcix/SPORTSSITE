'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Search, Users, X } from 'lucide-react'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './CreatorsMarketplace.module.css'
import { sportLogoUrl } from '@/lib/sportLogos'

export type CreatorDirectoryItem = {
  sports?: string[]; tags?: string[]; featured?:boolean; featured_rank?:number; access_mode?:'free'|'paid'
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  banner_url?: string | null
  avatar_ring_style?: import('@/lib/avatarStyles').MemberRingStyle | null
  avatar_ring_color?: string | null
  bio: string | null
  follower_count: number | null
  creator_products: Array<{ id: string; title: string; description: string | null; price: number; billing_period_days?: number | null; product_type: string }>
}

export function CreatorDirectory({ creators }: { creators: CreatorDirectoryItem[] }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('featured')
  const [sport,setSport]=useState('all')
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const matches = creators.filter(creator => (sport==='all'||creator.sports?.includes(sport))&&(!needle || [creator.display_name, creator.username, creator.bio,...creator.sports||[],...creator.tags||[], ...creator.creator_products.flatMap(product => [product.title, product.description])].some(value => value?.toLocaleLowerCase().includes(needle))))
    const lowest = (creator: CreatorDirectoryItem) => creator.access_mode==='free'?0:Math.min(...creator.creator_products.map(product=>Number(product.price)))
    return matches.toSorted((a,b)=>sort==='featured'&&(a.featured||b.featured)?Number(!!b.featured)-Number(!!a.featured)||(a.featured_rank??100)-(b.featured_rank??100):sort==='price'?lowest(a)-lowest(b):sort==='name'?(a.display_name||a.username).localeCompare(b.display_name||b.username):(b.follower_count||0)-(a.follower_count||0))
  }, [creators, query, sort,sport])

  return <section id="marketplace" className={styles.marketplace}>
    <header><label><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Search creators or memberships" aria-label="Search creators" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14}/></button>}</label><select aria-label="Sort creators" value={sort} onChange={event=>setSort(event.target.value)}><option value="featured">Featured first</option><option value="popular">Most followed</option><option value="price">Price: low to high</option><option value="name">Name: A–Z</option></select></header><nav className={styles.sportFilters} aria-label="Filter creators by sport">{['all',...new Set(creators.flatMap(creator=>creator.sports||[]))].map(value=><button key={value} aria-pressed={sport===value} onClick={()=>setSport(value)}>{sportLogoUrl(value)&&<SafeImage src={sportLogoUrl(value)} alt=""/>}{value==='all'?'All sports':value}</button>)}</nav><div className={styles.results}>{visible.length} {visible.length===1?'creator':'creators'}</div>
    {visible.length ? <div className={styles.grid}>{visible.map(creator => {
      const offer = [...(creator.creator_products??[])].sort((a,b)=>Number(a.price)-Number(b.price))[0]
      return <Link className={styles.card} href={`/creators/${creator.username}`} key={creator.id}>
        <div className={styles.cover}>{creator.banner_url?<SafeImage src={creator.banner_url} alt=""/>:<span/>}</div>
        <div className={styles.cardBody}>{creator.featured&&<span className={styles.featured}>Featured by SlipSurge</span>}
        <div className={styles.cardTop}>{creator.access_mode?<div className={styles.brandLogo}><SafeImage src={creator.avatar_url} alt="" fallback={(creator.display_name||creator.username)[0]}/></div>:<MemberAvatar src={creator.avatar_url} name={creator.display_name||creator.username} size={48} ringStyle={creator.avatar_ring_style} ringColor={creator.avatar_ring_color}/>}<div><h3>{creator.display_name || creator.username}</h3><span>@{creator.username}</span></div></div>
        <div className={styles.coverage}>{creator.sports?.map(value=><span key={value}>{sportLogoUrl(value)&&<SafeImage src={sportLogoUrl(value)} alt=""/>}{value}</span>)}</div><div className={styles.specialties}>{creator.tags?.slice(0,4).map(value=><span key={value}>{value}</span>)}</div><p>{creator.bio || offer?.description || 'Sports analysis and community access.'}</p>
        <div className={styles.offer}><span>{offer?.title || (creator.access_mode==='free'?'Free community':'View memberships')}</span><strong>{offer ? `${Number(offer.price).toFixed(2)}` : creator.access_mode==='free'?'Free':'View offers'}<small>{offer?.product_type === 'membership' ? ` / ${offer.billing_period_days||30} days` : offer?` · ${offer.billing_period_days||30} days access`:''}</small></strong></div>
        <footer><span>{creator.follower_count ?? 0} followers</span><b>Explore <ArrowRight size={14} /></b></footer></div>
      </Link>
    })}</div> : <div className={styles.empty}><div><Users size={28} /></div><h3>{query ? 'No creators match that search' : 'No creator storefronts available'}</h3>{query ? <button type="button" onClick={() => setQuery('')}>Clear search</button> : <Link href="/creators/studio">Start your community <ArrowRight size={15} /></Link>}</div>}
  </section>
}
