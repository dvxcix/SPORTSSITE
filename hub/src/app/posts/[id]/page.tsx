import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { notFound } from 'next/navigation'
import { PostCardClient } from '@/components/social/PostCardClient'
import type { Metadata } from 'next'

interface Props { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

// Picks/parlays get the generated share PNG as their Open Graph image, so
// pasting a /posts/{id} link into X, Reddit, iMessage, Slack, etc. auto-
// unfurls with the branded card — those platforms' own share/submit
// intents don't accept a binary image attachment via URL, only a link they
// crawl for OG tags, so this is what actually gets the image to show up
// rather than a bare link preview.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: post } = await supabase
    .from('posts')
    .select('pick_data, content, author:users(display_name, username)')
    .eq('id', id)
    .single()
  if (!post) return {}
  const author = (Array.isArray(post.author) ? post.author[0] : post.author) as { display_name?: string; username?: string } | null
  const name = author?.display_name || author?.username || 'Someone'
  const title = `${name} on SlipSurge`
  const description = post.content?.slice(0, 160) || `${name}'s post on SlipSurge`
  if (!post.pick_data) return { title, description }
  return {
    title, description,
    openGraph: { title, description, images: [`/api/share-image/${id}`] },
    twitter: { card: 'summary_large_image', title, description, images: [`/api/share-image/${id}`] },
  }
}

// The post composer's "Copy link" menu item has pointed at /posts/{id} since
// before this route existed — this is that missing page, and also gives
// notifications (comment/reaction/pick_result) somewhere concrete to link.
export default async function PostDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: post } = await supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .eq('id', id)
    .single()

  if (!post) notFound()

  // This page never went through attachUserReactions — a poll (or a
  // reaction/repost/bookmark) always looked un-interacted-with here even
  // when the viewer really had already voted/liked/etc, since every one of
  // those relies on this same enrichment everywhere else on the site.
  const [enriched] = await attachUserReactions([post], user?.id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <PostCardClient post={enriched} />
    </div>
  )
}
