import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await request.json().catch(() => null) as { postId?: unknown; emoji?: unknown } | null
  const postId = body?.postId
  const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : ''
  if (typeof postId !== 'string' || !UUID.test(postId) || !emoji || emoji.length > 32) {
    return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 })
  }

  const rate = await consumeServerRateLimit(user.id, 'reaction_notification', 300, 60 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Reaction delivery is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Reaction limit reached. Try again later.' }, { status: 429 })

  // Check through viewer RLS before invoking the service-role notification RPC.
  const { data: post, error: postError } = await supabase.from('posts').select('id,visibility').eq('id', postId).maybeSingle()
  if (postError) return NextResponse.json({ error: 'Post access could not be checked' }, { status: 503 })
  if (!post) return NextResponse.json({ error: 'Post unavailable' }, { status: 404 })
  if (post.visibility === 'private') return NextResponse.json({ ok: true })

  const { error } = await createAdminClient().rpc('notify_reaction_server', {
    p_actor_id: user.id,
    p_post_id: postId,
    p_emoji: emoji,
  })
  if (error) return safeApiError('reaction-notification', error, 'Could not deliver reaction', 400)
  return NextResponse.json({ ok: true })
}
