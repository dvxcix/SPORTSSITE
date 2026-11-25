import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { loadMessageInbox } from '@/lib/messageInboxServer'
import { searchMessageRecipients } from '@/lib/messageRecipients'
import { loadNativeThread, messageContext, openMessageRoom, updateNativeThread } from '@/lib/nativeMessageThread'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { changeNativeChannel, listNativeChannels, loadNativeChannel, openNativeChannel } from '@/lib/nativeChannels'
import { readChannelHistoryCursor } from '@/lib/channelHistory'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const query = new URL(request.url).searchParams
  try {
    switch (query.get('view') ?? 'inbox') {
      case 'inbox': return respond(await loadMessageInbox(supabase, userId))
      case 'search': return respond({ users: await searchMessageRecipients(supabase, userId, query.get('q') ?? '') })
      case 'channels': {
        const directory = await listNativeChannels(supabase, userId, query.get('group'))
        return directory.status ? respond({ error: 'Channels unavailable' }, directory.status) : respond(directory)
      }
      case 'thread': {
        const cursor = query.get('before')
        const before = cursor !== null && cursor.length <= 80 ? readChannelHistoryCursor(cursor) : null
        if (cursor !== null && !before) return respond({ error: 'Invalid message cursor' }, 400)
        if (query.get('kind') === 'channel') {
          const id = query.get('id')
          if (!id || !isAccountId(id)) return respond({ error: 'Invalid channel' }, 400)
          const result = await openNativeChannel(supabase, userId, id)
          return result.room ? respond(await loadNativeChannel(supabase, userId, result.room, before ?? undefined)) : respond({ error: 'Channel unavailable' }, result.status)
        }
        const context = messageContext(query)
        if (!context) return respond({ error: 'Invalid conversation' }, 400)
        const room = await openMessageRoom(supabase, userId, context)
        return room ? respond(await loadNativeThread(supabase, userId, room, before ?? undefined)) : respond({ error: 'Conversation unavailable' }, 404)
      }
      default: return respond({ error: 'Unknown inbox view' }, 400)
    }
  } catch {
    return respond({ error: 'Messages are temporarily unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  let body: Record<string, unknown>
  try {
    if (Number(request.headers.get('content-length')) > 16_384) return respond({ error: 'Message is too large' }, 413)
    const raw = await request.text()
    if (raw.length > 16_384) return respond({ error: 'Message is too large' }, 413)
    body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error()
  } catch {
    return respond({ error: 'Invalid message action' }, 400)
  }
  try {
    if (body.action === 'group-create') {
      const name = typeof body.text === 'string' ? body.text.trim() : ''
      const users = Array.isArray(body.users) ? [...new Set(body.users)] : []
      if (!name || name.length > 64 || users.length < 2 || users.length > 19 || users.some(id => typeof id !== 'string' || id === userId || !isAccountId(id))) {
        return respond({ error: 'Choose a name and two to nineteen members' }, 400)
      }
      const { data, error } = await supabase.rpc('create_group_conversation', { conversation_name: name, invited_user_ids: users })
      if (error || typeof data !== 'string' || !isAccountId(data)) return respond({ error: 'Group conversation could not be created' }, 403)
      return respond({ ok: true, id: data })
    }
    const query = new URL(request.url).searchParams
    if (query.get('kind') === 'channel') {
      const id = query.get('id')
      if (!id || !isAccountId(id)) return respond({ error: 'Invalid channel' }, 400)
      const result = await openNativeChannel(supabase, userId, id)
      if (!result.room) return respond({ error: 'Channel unavailable' }, result.status)
      const status = await changeNativeChannel(supabase, userId, result.room, body)
      return status === 200 ? respond({ ok: true }) : respond({ error: 'Message action couldn’t be confirmed' }, status)
    }
    const context = messageContext(query)
    if (!context) return respond({ error: 'Invalid conversation' }, 400)
    const room = await openMessageRoom(supabase, userId, context)
    if (!room) return respond({ error: 'Conversation unavailable' }, 404)
    const status = await updateNativeThread(supabase, userId, room, body)
    return status === 200 ? respond({ ok: true }) : respond({ error: 'Message action couldn’t be confirmed' }, status)
  } catch {
    return respond({ error: 'Messages are temporarily unavailable' }, 503)
  }
}
