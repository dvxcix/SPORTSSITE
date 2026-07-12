import { createClient } from '@/lib/supabase/server'
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
  const { data: post } = await supabase.from('posts').select('pick_data, content').eq('id', id).single()
  if (!post?.pick_data) return {}
  return {
    openGraph: { images: [`/api/share-image/${id}`] },
    twitter: { card: 'summary_large_image', images: [`/api/share-image/${id}`] },
  }
}

// The post composer's "Copy link" menu item has pointed at /posts/{id} since
// before this route existed — this is that missing page, and also gives
// notifications (comment/reaction/pick_result) somewhere concrete to link.
export default async function PostDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .eq('id', id)
    .single()

  if (!post) notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <PostCardClient post={post} />
    </div>
  )
}
