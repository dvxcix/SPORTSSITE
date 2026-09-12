import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { PostCardClient } from '@/components/social/PostCardClient'
import { Compass, Hash } from 'lucide-react'
import { TierGate } from '@/components/layout/TierGate'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { PageState } from '@/components/layout/PageState'
import { ProductAction, ProductHero, ProductPageShell, ProductSectionHeader } from '@/components/product/ProductPage'

export const revalidate = 60

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const rawTag = (await params).tag
  const tag = rawTag.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const blockedIds = user ? await getBlockedEitherWayIds(supabase, user.id) : []
  let query = supabase.from('posts').select('*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, bio, follower_count, is_verified, account_type, pick_record, tier, beta_access_active)').eq('visibility', 'public').or(`sport.ilike.${tag},content.ilike.%${tag}%,content.ilike.%#${tag}%`).order('created_at', { ascending: false }).limit(30)
  if (blockedIds.length) query = query.not('author_id', 'in', `(${blockedIds.join(',')})`)
  const { data: rawPosts } = tag ? await query : { data: [] }
  const posts = await attachUserReactions(rawPosts ?? [], user?.id)

  return <TierGate requiredTier="basic" label="Hashtags">
    <ProductPageShell narrow>
      <ProductHero icon={<Hash size={22} />} eyebrow="Topic" title={`#${tag || 'topic'}`} description="The latest community posts in this conversation." status={`${posts.length} posts`} actions={<ProductAction href="/explore"><Compass size={14} /> Explore</ProductAction>} />
      <ProductSectionHeader title="Latest posts" />
      {!posts.length ? <PageState kind="empty" title={`No posts for #${tag || 'topic'}`} message="New public posts will appear here." actionLabel="Explore the community" actionHref="/explore" /> : <div className="grid gap-3">{posts.map((post: any) => <PostCardClient key={post.id} post={post} />)}</div>}
    </ProductPageShell>
  </TierGate>
}
