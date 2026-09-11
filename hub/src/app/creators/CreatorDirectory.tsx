'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Search, Sparkles, X } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './CreatorsMarketplace.module.css'

export type CreatorDirectoryItem = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  follower_count: number | null
  creator_products: Array<{ id: string; title: string; description: string | null; price: number; product_type: string }>
}

export function CreatorDirectory({ creators }: { creators: CreatorDirectoryItem[] }) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return creators
    return creators.filter(creator => [creator.display_name, creator.username, creator.bio, ...creator.creator_products.flatMap(product => [product.title, product.description])].some(value => value?.toLocaleLowerCase().includes(needle)))
  }, [creators, query])

  return <section id="marketplace" className={styles.marketplace}>
    <header><div><span>EXPLORE</span><h2>Creator memberships</h2><p>{query ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : `${creators.length} available`}</p></div><label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Search creators" aria-label="Search creators" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14}/></button>}</label></header>
    {visible.length ? <div className={styles.grid}>{visible.map(creator => {
      const offer = creator.creator_products?.[0]
      return <Link className={styles.card} href={`/creators/${creator.username}`} key={creator.id}>
        <div className={styles.cardTop}><div className={styles.avatar}><SafeImage src={creator.avatar_url} alt="" fallback={(creator.display_name || creator.username)[0].toUpperCase()} /></div><div><h3>{creator.display_name || creator.username}</h3><span>@{creator.username}</span></div></div>
        <p>{creator.bio || offer?.description || 'Sports analysis and community access.'}</p>
        <div className={styles.offer}><span>{offer?.title || 'Creator membership'}</span><strong>{offer ? `$${Number(offer.price).toFixed(2)}` : 'View offers'}<small>{offer?.product_type === 'membership' ? '/mo' : ''}</small></strong></div>
        <footer><span>{creator.follower_count ?? 0} followers</span><b>View profile <ArrowRight size={14} /></b></footer>
      </Link>
    })}</div> : <div className={styles.empty}><div><Sparkles size={28} /></div><h3>{query ? 'No creators match that search.' : 'The first storefronts are being prepared.'}</h3>{query ? <button type="button" onClick={() => setQuery('')}>Clear search</button> : <Link href="/creators/apply">Become a creator <ArrowRight size={15} /></Link>}</div>}
  </section>
}
