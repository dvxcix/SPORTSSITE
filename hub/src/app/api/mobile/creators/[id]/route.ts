import { NextResponse } from 'next/server'
import { isAccountId, isBlockedEitherWay } from '@/lib/blocks'
import { loadPublicCreators } from '@/lib/creatorDirectoryServer'
import { notify } from '@/lib/notify'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

type Context = { params: Promise<{ id: string }> }
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

async function access(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return { denied: account.error }
  const { id } = await context.params
  if (!isAccountId(id) || id === account.userId || await isBlockedEitherWay(account.supabase, account.userId, id) ||
    !(await loadPublicCreators(account.supabase)).some(creator => creator.id === id)) {
    return { denied: response({ error: 'Creator unavailable' }, 404) }
  }
  return { ...account, id }
}

export async function GET(request: Request, context: Context) {
  try {
    const account = await access(request, context)
    if (account.denied) return account.denied
    const { data, error } = await account.supabase.from('follows').select('following_id')
      .eq('follower_id', account.userId).eq('following_id', account.id).maybeSingle()
    if (error) throw error
    return response({ following: Boolean(data) })
  } catch {
    return response({ error: 'Follow status is unavailable' }, 503)
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const account = await access(request, context)
    if (account.denied) return account.denied
    const raw = await request.text()
    if (raw.length > 256) return response({ error: 'Invalid follow change' }, 400)
    const body = JSON.parse(raw) as { follow?: unknown } | null
    if (typeof body?.follow !== 'boolean') return response({ error: 'Invalid follow change' }, 400)
    const { supabase, userId, id } = account
    const fields = { follower_id: userId, following_id: id }
    const change = body.follow ? await supabase.from('follows').insert(fields) : await supabase.from('follows').delete().match(fields)
    if (change.error && change.error.code !== '23505') return response({ error: 'Follow change was not saved' }, 403)
    if (body.follow && !change.error) {
      const { data: actor } = await supabase.from('users').select('username').eq('id', userId).maybeSingle()
      await notify(supabase, { userId: id, actorId: userId, type: 'follow', message: 'started following you',
        link: actor?.username ? `/profile/${actor.username}` : null })
    }
    return response({ following: body.follow })
  } catch {
    return response({ error: 'Follow change could not be confirmed' }, 503)
  }
}
