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

  const body = await request.json().catch(() => null) as { postId?: unknown; optionIndex?: unknown } | null
  const postId = body?.postId
  const optionIndex = body?.optionIndex
  if (typeof postId !== 'string' || !UUID.test(postId) || !Number.isInteger(optionIndex) || Number(optionIndex) < 0 || Number(optionIndex) > 99) {
    return NextResponse.json({ error: 'Invalid poll vote' }, { status: 400 })
  }

  const rate = await consumeServerRateLimit(user.id, 'poll_vote', 120, 60 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Voting is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Voting limit reached. Try again later.' }, { status: 429 })

  const { data, error } = await createAdminClient().rpc('cast_poll_vote_server', {
    p_post_id: postId,
    p_user_id: user.id,
    p_option_index: Number(optionIndex),
  })
  if (error) return safeApiError('poll-vote', error, 'Could not record vote', 400)
  return NextResponse.json({ optionIndex: data })
}
