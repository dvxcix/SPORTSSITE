'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Search, Users, X } from 'lucide-react'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { sportLogoUrl } from '@/lib/sportLogos'
import { findPublicCreators, type CreatorDirectoryItem } from '@/lib/publicCreatorDirectory'
import styles from './CreatorsMarketplace.module.css'

export type { CreatorDirectoryItem } from '@/lib/publicCreatorDirectory'

export function CreatorDirectory({ creators }: { creators: CreatorDirectoryItem[] }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('featured')
  const [sport, setSport] = useState('all')
  const visible = useMemo(() => findPublicCreators(creators, query, sport, sort), [creators, query, sort, sport])
  const filtering = Boolean(query.trim()) || sport !== 'all'
  const clearFilters = () => { setQuery(''); setSport('all') }

  return <section id="marketplace" className={styles.marketplace} aria-label="Creator directory">
    <header>
      <label><Search size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Search people, sports or memberships" aria-label="Search creators" autoComplete="off" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} aria-hidden="true" /></button>}</label>
      <select aria-label="Sort creators" value={sort} onChange={event => setSort(event.target.value)}><option value="featured">Featured first</option><option value="popular">Most followed</option><option value="price">Membership: low to high</option><option value="name">Name: A–Z</option></select>
    </header>
    <nav className={styles.sportFilters} aria-label="Filter creators by sport">{['all', ...new Set(creators.flatMap(creator => creator.sports))].map(value => <button type="button" key={value} aria-pressed={sport === value} onClick={() => setSport(value)}>{sportLogoUrl(value) && <SafeImage src={sportLogoUrl(value)} alt="" />}{value === 'all' ? 'All sports' : value}</button>)}</nav>
    <div className={styles.results}><p role="status">{visible.length} {visible.length === 1 ? 'creator' : 'creators'}{filtering ? ' found' : ''}</p>{filtering && visible.length > 0 && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
    {visible.length ? <div className={styles.grid}>{visible.map(creator => {
      const name = creator.display_name || creator.username
      const profileHref = `/creators/${creator.username}`
      const store = creator.storefront
      const offer = creator.creator_products.filter(product => Number.isFinite(Number(product.price)) && Number(product.price) >= 0).toSorted((a, b) => Number(a.price) - Number(b.price))[0]
      return <article className={styles.card} key={creator.id} aria-labelledby={`creator-${creator.id}`}>
        {creator.banner_url && <div className={styles.cover}><SafeImage src={creator.banner_url} alt="" /></div>}
        <div className={styles.cardBody}>
          {creator.featured && <span className={styles.featured}>Featured by SlipSurge</span>}
          <Link className={styles.person} href={profileHref} aria-label={`View ${name} creator profile`}>
            <MemberAvatar src={creator.avatar_url} name={name} size={64} tone="creator" ringStyle={creator.avatar_ring_style} ringColor={creator.avatar_ring_color} />
            <div><h2 id={`creator-${creator.id}`}>{name}{creator.is_verified && <BadgeCheck size={16} aria-label="Verified member" />}</h2><span>@{creator.username}</span></div>
          </Link>
          {creator.bio && <p className={styles.bio}>{creator.bio}</p>}
          {creator.sports.length > 0 && <div className={styles.coverage} aria-label="Sports covered">{creator.sports.map(value => <span key={value}>{sportLogoUrl(value) && <SafeImage src={sportLogoUrl(value)} alt="" />}{value}</span>)}</div>}
          {creator.tags.length > 0 && <div className={styles.specialties}>{creator.tags.slice(0, 4).map(value => <span key={value}>{value}</span>)}</div>}
          {store && <div className={styles.storeContext}>{store.logo_url && <SafeImage src={store.logo_url} alt="" />}<div><span>Storefront</span><strong>{store.name}</strong>{store.access_mode === 'free' && <small>Free community</small>}</div></div>}
          {!store && offer && <div className={styles.storeContext}><div><span>Membership</span><strong>{offer.title}</strong></div></div>}
          <footer>
            {typeof creator.follower_count === 'number' && <span className={styles.followers}><Users size={13} aria-hidden="true" />{creator.follower_count.toLocaleString()} followers</span>}
            <div className={styles.cardActions}><Link href={`/profile/${creator.username}`}>Posts & record</Link><Link href={store || offer ? `${profileHref}#memberships` : profileHref}>{store || offer ? 'Storefront' : 'View creator'}<ArrowRight size={14} aria-hidden="true" /></Link></div>
          </footer>
        </div>
      </article>
    })}</div> : <div className={styles.empty}><Users size={28} aria-hidden="true" /><h2>{filtering ? 'No creators match' : 'No creators to show yet'}</h2><p>{filtering ? 'Try another name or clear your sport filter.' : 'Published creators will appear here.'}</p>{filtering ? <button type="button" onClick={clearFilters}>Clear filters</button> : <Link href="/creators/studio">Open Creator Studio <ArrowRight size={15} aria-hidden="true" /></Link>}</div>}
  </section>
}
