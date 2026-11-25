import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import styles from './CreatorsMarketplace.module.css'
import { pageMetadata } from '@/lib/siteMetadata'
import { CreatorDirectory } from './CreatorDirectory'
import { loadPublicCreators } from '@/lib/creatorDirectoryServer'

export const metadata = pageMetadata({ title: 'Discover Sports Creators | SlipSurge', description: 'Meet the people sharing sports research and picks. Explore their public profiles, coverage and memberships.', path: '/creators' })

export const dynamic = 'force-dynamic'

export default async function CreatorsPage() {
  const supabase = await createClient()
  const creators = await loadPublicCreators(supabase)
  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>Discover sports creators</h1><p>Find the people behind the picks. Explore their profiles, research and memberships.</p></div><div className={styles.heroActions}><Link href="/groups">Browse communities</Link><Link href="/creators/studio">Creator Studio <ArrowUpRight size={16} aria-hidden="true"/></Link></div></header>

    <CreatorDirectory creators={creators} />
  </div>
}
