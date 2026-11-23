import { createClient } from '@/lib/supabase/server'
import { CommunityDirectory } from '@/components/groups/CommunityDirectory'
import type { CommunityDirectoryEntry } from '@/lib/creatorCommunityDirectory'
import { DiscoveryLink } from './DiscoveryLink'
import styles from './LandingPage.module.css'

export function PublicCommunitiesLoading() {
  return <div className={styles.communityLoading} role="status" aria-label="Loading public communities">
    <span>Loading public communities…</span>
    <div aria-hidden="true"><i /><i /><i /></div>
  </div>
}

/** A small normal-RLS directory projection, never posts, members or paid content. */
async function loadPublicCommunities(): Promise<CommunityDirectoryEntry[] | null> {
  try {
    const client = await createClient()
    const { data, error } = await client.from('groups')
      .select('id,slug,name,description,sport,avatar_url,banner_url,emoji,member_count,owner_id,creator_product_id,access_type,is_public')
      .eq('is_public', true).eq('access_type', 'free')
      .or('sport.is.null,sport.in.(NBA,NFL)')
      .order('member_count', { ascending: false }).limit(3).abortSignal(AbortSignal.timeout(4000))
    if (error) throw error
    // Keep these guards in the UI projection as well as the database filter.
    return (data ?? []).filter(group => group.is_public && group.access_type === 'free' && (!group.sport || ['NBA','NFL'].includes(group.sport))) as CommunityDirectoryEntry[]
  } catch {
    return null
  }
}

export async function PublicCommunities() {
  const groups = await loadPublicCommunities()
  if (groups === null) return <div className={styles.communityState} role="status">
    <p>Community previews are unavailable right now.</p>
    <p>You can still open the directory and browse the public Feed.</p>
    <div className={styles.actions}><DiscoveryLink href="/groups" destination="communities" className={styles.secondaryButton}>Open communities</DiscoveryLink><DiscoveryLink href="/feed" destination="feed" className={styles.textLink}>Read the Feed</DiscoveryLink></div>
  </div>
  if (!groups.length) return <div className={styles.communityState}>
      <p>Find a community for your sport.</p>
      <p>Browse free communities and creator memberships before choosing where to join.</p>
      <DiscoveryLink href="/groups" destination="communities" className={styles.secondaryButton}>Browse communities</DiscoveryLink>
    </div>
  return <div className={styles.publicCommunities}><CommunityDirectory groups={groups} joinedIds={[]} userId={null} invitations={[]} variant="storefront" headingLevel={3} /></div>
}
