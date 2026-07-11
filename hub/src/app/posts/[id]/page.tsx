import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PostCardClient } from '@/components/social/PostCardClient'

interface Props { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

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
