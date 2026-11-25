import { NextResponse } from 'next/server'
import { isAccountId, unblockUser } from '@/lib/blocks'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const pageSize = 40
const personFields = 'id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified'

type Person = {
  id: string
  username: string | null
  display_name?: string
  avatar_url?: string
  avatar_ring_style?: string
  avatar_ring_color?: string
  is_verified?: boolean
}

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const query = new URL(request.url).searchParams
  const kind = query.get('kind'), cursor = query.get('offset') ?? '0'
  if ((kind !== 'blocked' && kind !== 'muted') || query.getAll('kind').length !== 1 ||
      query.getAll('offset').length > 1 || !/^(?:0|[1-9]\d{0,6})$/.test(cursor)) {
    return respond({ error: 'Invalid account list' }, 400)
  }

  const offset = Number(cursor)
  const rangeEnd = offset + pageSize
  try {
    if (kind === 'blocked') {
      const { data, error } = await supabase.from('blocks')
        .select(`blocked_id,created_at,person:users!blocks_blocked_id_fkey(${personFields})`)
        .eq('blocker_id', userId).order('created_at', { ascending: false }).order('blocked_id')
        .range(offset, rangeEnd)
      if (error) throw Error()
      const rows = data ?? []
      const people = rows.slice(0, pageSize).map(row => {
        const person = (Array.isArray(row.person) ? row.person[0] : row.person) as unknown as Person | null
        return { ...(person ?? { id: row.blocked_id, username: null }), restrictedAt: row.created_at }
      })
      return respond({ people, nextOffset: rows.length > pageSize ? rangeEnd : null })
    }

    const { data, error } = await supabase.from('feed_suppressions').select('target_id')
      .eq('user_id', userId).eq('target_type', 'author').order('target_id').range(offset, rangeEnd)
    if (error) throw Error()
    const rows = data ?? []
    const ids = rows.slice(0, pageSize).map(row => row.target_id)
    if (!ids.length) return respond({ people: [], nextOffset: null })
    const identities = await supabase.from('users').select(personFields).in('id', ids)
    if (identities.error) throw Error()
    const visible = new Map((identities.data ?? []).map(person => [person.id, person]))
    return respond({
      people: ids.map(id => visible.get(id) ?? { id, username: null }),
      nextOffset: rows.length > pageSize ? rangeEnd : null,
    })
  } catch {
    return respond({ error: 'Account list is temporarily unavailable' }, 503)
  }
}

export async function DELETE(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const query = new URL(request.url).searchParams
  const kind = query.get('kind'), id = query.get('id')
  if ((kind !== 'blocked' && kind !== 'muted') || query.getAll('kind').length !== 1 ||
      !id || !isAccountId(id) || id.toLowerCase() === userId.toLowerCase() || query.getAll('id').length !== 1) {
    return respond({ error: 'Invalid account selection' }, 400)
  }
  try {
    if (kind === 'blocked') {
      const result = await unblockUser(supabase, userId, id.toLowerCase())
      if (!result.ok) throw Error()
    } else {
      const result = await supabase.from('feed_suppressions').delete()
        .match({ user_id: userId, target_type: 'author', target_id: id })
      if (result.error) throw Error()
    }
    return respond({ ok: true })
  } catch {
    return respond({ error: 'Account change could not be confirmed' }, 503)
  }
}
