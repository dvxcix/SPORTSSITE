import { NextResponse } from 'next/server'
import { nativeNotificationArtwork, nativePlayerNewsName } from '@/lib/nativeNotificationArtwork'
import { requireTier } from '@/lib/requireTier'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const unavailable = () => NextResponse.json({ error: 'Notifications are temporarily unavailable' }, { status: 503, headers })

async function notificationAccount(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return { error: account.error }
  const gate = await requireTier('basic')
  if (gate.error) return { error: gate.error }
  return account
}

export async function GET(request: Request) {
  const account = await notificationAccount(request)
  if (account.error) return account.error
  const { userId, supabase } = account
  const id = new URL(request.url).searchParams.get('id')
  if (id !== null && !uuid.test(id)) return NextResponse.json({ error: 'Invalid notification' }, { status: 400, headers })
  try {
    const blocked = await getBlockedEitherWayIds(supabase, userId)
    let query = supabase.from('notifications')
      .select('id,type,message,body,link,read,created_at,actor_id,target_id,target_type,artwork:data->>avatar_url,player:data->>player_name,actor:users!notifications_actor_id_fkey(username,display_name,avatar_url,avatar_ring_style,avatar_ring_color)')
      .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50)
    if (id) query = query.eq('id', id)
    if (blocked.length) query = query.or(`actor_id.is.null,actor_id.not.in.(${blocked.join(',')})`)
    const { data, error } = await query
    if (error) return unavailable()
    const notifications = (data ?? []).map(({ artwork, player, ...row }) => ({
      ...row, artwork_url: nativeNotificationArtwork(row.type, row.actor_id, artwork),
      player_name: nativePlayerNewsName(row.type, row.actor_id, player),
    }))
    return NextResponse.json({ notifications }, { headers })
  } catch {
    return unavailable()
  }
}

async function selection(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) return null
  try {
    const raw = await request.text()
    if (raw.length > 2400) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) return null
    if ('clearAll' in value && value.clearAll === true) return { ids: null }
    if (!('ids' in value) || !Array.isArray(value.ids) ||
        !value.ids.length || value.ids.length > 50 ||
        !value.ids.every((item): item is string => typeof item === 'string' && uuid.test(item))) return null
    return { ids: [...new Set(value.ids as string[])] }
  } catch {
    return null
  }
}

export async function PATCH(request: Request) {
  const account = await notificationAccount(request)
  if (account.error) return account.error
  const { userId, supabase } = account
  const selected = await selection(request)
  if (!selected?.ids) return NextResponse.json({ error: 'Select notifications to mark as read' }, { status: 400, headers })
  const { error } = await supabase.from('notifications').update({ read: true })
    .eq('user_id', userId).in('id', selected.ids)
  return error ? unavailable() : NextResponse.json({ ok: true }, { headers })
}

export async function DELETE(request: Request) {
  const account = await notificationAccount(request)
  if (account.error) return account.error
  const { userId, supabase } = account
  const selected = await selection(request)
  if (!selected) return NextResponse.json({ error: 'Select notifications to remove' }, { status: 400, headers })
  let query = supabase.from('notifications').delete().eq('user_id', userId)
  if (selected.ids) query = query.in('id', selected.ids)
  const { error } = await query
  return error ? unavailable() : NextResponse.json({ ok: true }, { headers })
}
