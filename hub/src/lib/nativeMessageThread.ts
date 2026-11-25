import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAccountId, isBlockedEitherWay } from '@/lib/blocks'
import { loadDmHistory, loadGroupHistory } from '@/lib/conversationHistory'
import type { ChannelHistoryCursor } from '@/lib/channelHistory'
import { notify } from '@/lib/notify'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'

type Context = { kind: 'direct' | 'group'; id: string }
type Partner = { id: string; username: string; display_name: string | null; avatar_url: string | null; allow_dms: boolean }
type Member = { user_id: string; role: string; muted: boolean }
type Room = { context: Context; title: string; partner: Partner | null; members: Member[] }
type RecordValues = Record<string, unknown>

export function messageContext(query: URLSearchParams): Context | null {
  const kind = query.get('kind'), id = query.get('id')
  return id && isAccountId(id) && (kind === 'direct' || kind === 'group') ? { kind, id } : null
}

export async function openMessageRoom(client: SupabaseClient, userId: string, context: Context): Promise<Room | null> {
  if (context.kind === 'direct') {
    if (context.id === userId || await isBlockedEitherWay(client, userId, context.id)) return null
    const { data: partner, error } = await client.from('users').select('id,username,display_name,avatar_url,allow_dms').eq('id', context.id).maybeSingle()
    if (error) throw Error('Conversation unavailable')
    return partner ? { context, title: partner.display_name || partner.username, partner, members: [] } : null
  }
  const [group, members] = await Promise.all([
    client.from('group_conversations').select('name').eq('id', context.id).maybeSingle(),
    client.from('group_conversation_members').select('user_id,role,muted').eq('conversation_id', context.id).order('joined_at'),
  ])
  if (group.error || members.error) throw Error('Conversation unavailable')
  return group.data && members.data?.some(member => member.user_id === userId)
    ? { context, title: group.data.name, partner: null, members: members.data } : null
}

export async function loadNativeThread(client: SupabaseClient, userId: string, room: Room, before?: ChannelHistoryCursor) {
  const direct = room.context.kind === 'direct'
  const scope = room.context.id, signal = AbortSignal.timeout(12_000)
  const size = direct ? 100 : 200
  const page = { limit: size + 1, before }
  const [history, receipt] = await Promise.all([
    direct ? loadDmHistory(client, userId, scope, signal, page) : loadGroupHistory(client, scope, signal, page),
    direct && !before ? client.from('message_read_positions').select('last_read_at').eq('context_type', 'dm')
      .eq('user_id', scope).eq('partner_id', userId).maybeSingle() : null,
  ])
  const messages = history.slice(-size)
  const oldest = messages[0]
  const nextCursor = history.length > size && oldest ? `${oldest.created_at}|${oldest.id}` : null
  const ids = messages.filter(message => !message.is_deleted).map(message => message.id)
  const [pins, reactions] = ids.length === 0 ? [{ data: [], error: null }, { data: [], error: null }] : await Promise.all([
    direct ? client.from('message_pins').select('message_id').eq('user_id', userId).in('message_id', ids) : { data: [], error: null },
    direct ? client.from('reactions').select('message_id:target_id,user_id,emoji').eq('target_type', 'message').in('target_id', ids)
      : client.from('group_message_reactions').select('message_id,user_id,emoji').in('message_id', ids),
  ])
  if (pins.error || reactions.error) throw Error('Conversation unavailable')
  const members = direct ? [] : await client.from('group_conversation_members')
    .select('id:user_id,role,muted,user:users!group_conversation_members_user_id_fkey(id,username,display_name,avatar_url)')
    .eq('conversation_id', scope).order('joined_at').then(result => {
      if (result.error) throw Error('Participants unavailable')
      return result.data ?? []
    })
  return { title: room.title, partner: room.partner, members, pins: (pins.data ?? []).map(pin => pin.message_id),
    reactions: (reactions.data ?? []).map(row => ({ messageId: row.message_id, emoji: row.emoji, mine: row.user_id === userId })),
    messages: messages.map(message => message.is_deleted ? { ...message, content: '', media_urls: [], reply_to: null } : message), nextCursor,
    partnerLastReadAt: receipt?.data?.last_read_at ?? null,
    canSend: room.partner?.allow_dms ?? true, muted: room.members.find(member => member.user_id === userId)?.muted ?? false,
    owner: room.members.find(member => member.user_id === userId)?.role === 'owner',
  }
}

const messageIdentityColumns = 'id,sender_id,is_deleted,created_at'

function scopedMessage<Columns extends string = typeof messageIdentityColumns>(client: SupabaseClient, userId: string,
  { kind, id }: Context, messageId: string, columns?: Columns) {
  const selection = columns ?? (messageIdentityColumns as Columns)
  const query = client.from(kind === 'direct' ? 'messages' : 'group_messages').select(selection).eq('id', messageId)
  return kind === 'direct' ? query.or(`and(sender_id.eq.${userId},dm_recipient_id.eq.${id}),and(sender_id.eq.${id},dm_recipient_id.eq.${userId})`)
    : query.eq('conversation_id', id)
}

async function markRoomRead(client: SupabaseClient, userId: string, context: Context, messageId: string, createdAt: string) {
  const direct = context.kind === 'direct', id = context.id
  if (!direct) {
    const result = await client.from('group_conversation_members').update({ last_read_at: createdAt })
      .eq('conversation_id', id).eq('user_id', userId).or(`last_read_at.is.null,last_read_at.lt.${createdAt}`)
    return !result.error
  }
  const match = { user_id: userId, partner_id: id, context_type: 'dm' }
  const values = { last_read_message_id: messageId, last_read_at: createdAt }
  const advance = () => client.from('message_read_positions').update(values).match(match).lt('last_read_at', createdAt).select('user_id').maybeSingle()
  const update = await advance()
  if (update.error) return false
  if (!update.data) {
    const { error } = await client.from('message_read_positions').insert({ ...match, ...values })
    if (error && (error.code !== '23505' || (await advance()).error)) return false
  }
  await client.from('notifications').update({ read: true }).eq('user_id', userId).eq('actor_id', id)
    .eq('type', 'message').eq('read', false).lte('created_at', createdAt)
  return true
}

export async function updateNativeThread(client: SupabaseClient, userId: string, room: Room, action: RecordValues): Promise<number> {
  const { context, members } = room
  const { id } = context, direct = context.kind === 'direct'
  const verb = action.action
  if (verb === 'forward' && direct) {
    const target = typeof action.user === 'string' && isAccountId(action.user) ? action.user : null
    const source = typeof action.message === 'string' && isAccountId(action.message) ? action.message : null
    const identity = typeof action.forwardId === 'string' && isAccountId(action.forwardId) ? action.forwardId : null
    if (!target || !source || !identity || target === userId || identity === source) return 400
    const recipient = await openMessageRoom(client, userId, { kind: 'direct', id: target })
    if (!recipient) return 404
    if (recipient.partner?.allow_dms !== true) return 403
    const old = await scopedMessage(client, userId, recipient.context, identity, 'id,sender_id,forwarded_from_id').maybeSingle()
    if (old.error) return 503
    if (old.data) return old.data.sender_id === userId && old.data.forwarded_from_id === source ? 200 : 409

    const message = await scopedMessage(client, userId, context, source, 'id,content,media_urls,message_type,pick_data,is_deleted').maybeSingle()
    if (message.error) return 503
    if (!message.data || message.data.is_deleted) return 404
    const item = message.data
    const result = await client.from('messages').insert({ id: identity, sender_id: userId, dm_recipient_id: target,
      content: item.content, media_urls: item.media_urls ?? [], message_type: item.message_type,
      pick_data: item.pick_data, forwarded_from_id: source })
    if (result.error?.code === '23505') {
      const raced = await scopedMessage(client, userId, recipient.context, identity, 'id,sender_id,forwarded_from_id').maybeSingle()
      return raced.data?.sender_id === userId && raced.data?.forwarded_from_id === source ? 200 : 409
    }
    return result.error ? (result.error.code === '42501' ? 403 : 503) : 200
  }
  if (verb === 'request' && direct && (action.status === 'accepted' || action.status === 'declined')) {
    const { error } = await client.from('dm_conversation_preferences').upsert({ user_id: userId, partner_id: id,
      status: action.status, updated_at: new Date().toISOString() }, { onConflict: 'user_id,partner_id' })
    return error ? 503 : 200
  }
  if (verb === 'mute' && !direct && typeof action.enabled === 'boolean') {
    const { error } = await client.from('group_conversation_members').update({ muted: action.enabled }).eq('conversation_id', id).eq('user_id', userId)
    return error ? 503 : 200
  }
  if (verb === 'leave' && !direct) {
    if (members.some(member => member.user_id === userId && member.role === 'owner')) return 403
    const { error } = await client.from('group_conversation_members').delete().eq('conversation_id', id).eq('user_id', userId)
    return error ? 503 : 200
  }
  if (verb === 'member' && !direct && typeof action.user === 'string' && isAccountId(action.user)
    && (action.status === 'add' || action.status === 'remove')) {
    if (!members.some(member => member.user_id === userId && member.role === 'owner')) return 403
    const { error } = await client.rpc('manage_group_conversation_member', {
      target_conversation_id: id, target_user_id: action.user, member_action: action.status,
    })
    return error ? 403 : 200
  }

  const messageId = typeof action.message === 'string' && isAccountId(action.message) ? action.message : null
  if (!messageId) return 400
  const { data: message, error } = await scopedMessage(client, userId, context, messageId).maybeSingle()
  if (error) return 503
  const table = direct ? 'messages' : 'group_messages'
  const text = typeof action.text === 'string' ? action.text.trim() : ''
  if (verb === 'send') {
    if (message) return message.sender_id === userId ? 200 : 409
    const media = action.image == null ? null : isOwnedNativeMedia(action.image, userId, 'messages') ? action.image : null
    if ((!text && !media) || text.length > 1_000 || (action.image != null && !media)) return 400
    if (room.partner && !room.partner.allow_dms) return 403
    let reply: string | null = null
    if (action.reply != null) {
      if (typeof action.reply !== 'string' || !isAccountId(action.reply)) return 400
      const result = await scopedMessage(client, userId, context, action.reply).eq('is_deleted', false).maybeSingle()
      if (result.error) return 503
      if (!result.data) return 404
      reply = result.data.id
    }
    const scope = direct ? { dm_recipient_id: id, message_type: media ? 'media' : 'text' } : { conversation_id: id }
    const insert = await client.from(table).insert({ ...scope, id: messageId, sender_id: userId, content: text, reply_to_id: reply, media_urls: media ? [media] : [] })
    if (insert.error) {
      if (insert.error.code === '23505') {
        const latest = await scopedMessage(client, userId, context, messageId).maybeSingle()
        return latest.data?.sender_id === userId ? 200 : 409
      }
      return insert.error.code === '42501' ? 403 : 503
    }
    if (direct) {
      const [me] = await Promise.all([
        client.from('users').select('username').eq('id', userId).maybeSingle(),
        client.from('dm_conversation_preferences').upsert({ user_id: userId, partner_id: id,
          status: 'accepted', updated_at: new Date().toISOString() }, { onConflict: 'user_id,partner_id' }),
      ])
      await notify(client, { userId: id, actorId: userId, type: 'message', message: 'sent you a message',
        link: me.data?.username ? `/messages/${encodeURIComponent(me.data.username)}` : null, targetId: userId, targetType: 'user' }).catch(() => {})
    } else {
      await Promise.allSettled(members.filter(member => member.user_id !== userId && !member.muted).map(member => notify(client, {
        userId: member.user_id, actorId: userId, type: 'message', message: `sent a message in ${room.title}`,
        link: `/messages/group/${id}`, targetId: id, targetType: 'group_conversation',
      })))
    }
    return 200
  }
  if (!message) return 404
  if (verb === 'read') return await markRoomRead(client, userId, context, message.id, message.created_at) ? 200 : 503
  if (message.is_deleted) return verb === 'delete' && message.sender_id === userId ? 200 : 404
  if (verb === 'pin' && direct && typeof action.enabled === 'boolean') {
    const identity = { user_id: userId, message_id: messageId }
    const pins = client.from('message_pins')
    const result = await (action.enabled ? pins.insert(identity) : pins.delete().match(identity))
    return !result.error || result.error.code === '23505' ? 200 : 503
  }
  if (verb === 'react' && typeof action.enabled === 'boolean' && typeof action.emoji === 'string' && action.emoji.trim() && [...action.emoji].length <= 16) {
    const reaction: Record<string, string> = { user_id: userId, emoji: action.emoji.trim(),
      ...(direct ? { target_id: messageId, target_type: 'message' } : { message_id: messageId }) }
    const reactions = client.from(direct ? 'reactions' : 'group_message_reactions')
    const result = await (action.enabled ? reactions.insert(reaction) : reactions.delete().match(reaction))
    return !result.error || result.error.code === '23505' ? 200 : 503
  }
  if (verb === 'edit' || verb === 'delete') {
    if (message.sender_id !== userId) return 403
    if (verb === 'edit' && (!text || text.length > 1_000)) return 400
    const values = verb === 'delete' ? { content: '', media_urls: [], is_deleted: true } : { content: text }
    const result = await client.from(table).update({ ...values, edited_at: new Date().toISOString() })
      .eq('id', message.id).eq('sender_id', userId).eq('is_deleted', false).select('id').maybeSingle()
    return result.error ? 503 : result.data ? 200 : 409
  }
  return 400
}
