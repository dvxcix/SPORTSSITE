import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const views = new URL(request.url).searchParams.getAll('view')
  if (views.length !== 1 || views[0] !== 'activity' && views[0] !== 'missions') {
    return respond({ error: 'Invalid member view' }, 400)
  }

  try {
    if (views[0] === 'activity') {
      const { data, error } = await supabase.from('member_activity_events')
        .select('id,activity_type,target_path,label,occurred_at').eq('user_id', userId)
        .order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(150)
      if (error) throw Error()
      return respond({ events: data ?? [] })
    }

    const { data, error } = await supabase.rpc('get_member_mastery')
    if (error || !data) throw Error()
    return respond(data)
  } catch {
    return respond({ error: 'Member progress is temporarily unavailable' }, 503)
  }
}
