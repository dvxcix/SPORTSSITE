import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { redirect } from 'next/navigation'
import { PostCardClient } from '@/components/social/PostCardClient'
import { Bookmark, Compass } from 'lucide-react'
import { TierGate } from '@/components/layout/TierGate'
import { PageState } from '@/components/layout/PageState'
import { ProductAction, ProductHero, ProductPageShell, ProductSectionHeader } from '@/components/product/ProductPage'

export const dynamic = 'force-dynamic'

export default async function BookmarksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/bookmarks')

  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select(`post:posts(*,author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record, tier, beta_access_active))`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  const bookmarkedPosts = (bookmarks ?? []).map((bookmark: any) => bookmark.post).filter(Boolean)
  const posts = (await attachUserReactions(bookmarkedPosts, user.id)).map(post => ({ ...post, user_bookmarked: true }))

  return (
    <TierGate requiredTier="basic" label="Bookmarks">
      <ProductPageShell narrow>
        <ProductHero icon={<Bookmark size={23} />} eyebrow="Your saved library" title="Bookmarks" description="Keep picks, research notes, and community posts ready for your next visit." status={`${posts.length} saved`} actions={<ProductAction href="/explore"><Compass size={14} />Explore</ProductAction>} />
        {posts.length === 0 ? (
          <PageState kind="empty" title="Your saved library is empty" message="Use the bookmark action on a post to keep it here." actionLabel="Explore the community" actionHref="/explore" />
        ) : (
          <>
            <ProductSectionHeader title="Saved posts" meta={`${posts.length} most recent`} />
            <div className="space-y-3">
              {posts.map((post: any) => <PostCardClient key={post.id} post={post} />)}
            </div>
          </>
        )}
      </ProductPageShell>
    </TierGate>
  )
}
