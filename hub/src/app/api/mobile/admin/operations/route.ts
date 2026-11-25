import { NextResponse } from 'next/server'
import { writeAdminAudit } from '@/lib/adminAudit'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const types = new Set(['follow', 'reaction', 'comment', 'mention', 'pick_result', 'subscription', 'message', 'repost', 'group_invite', 'new_pick'])
const pattern = (text: string) => JSON.stringify(`%${text.replace(/[\\%_]/g, '\\$&')}%`)

function date(value: string | null) {
  if (value === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : undefined
}

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  if (kind === 'groups') {
    const owner = params.get('owner')
    if (owner && !isAccountId(owner)) return reply({ error: 'Invalid community owner' }, 400)
    let groups = actor.admin.from('groups')
      .select('id,name,slug,owner_id,sport,emoji,avatar_url,is_public,access_type,member_count,created_at,owner:users(username,display_name)')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
    if (owner) groups = groups.eq('owner_id', owner)
    const result = await groups
    return result.error ? reply({ error: 'Communities could not be loaded' }, 503) : reply({ groups: result.data ?? [] })
  }
  const search = (params.get('q') ?? '').trim()
  if (search.length > 100 || /[\x00-\x1f]/.test(search)) return reply({ error: 'Check the search term' }, 400)
  if (kind === 'audit') {
    const action = params.get('action')
    if (action && !/^[a-z0-9_.:-]{1,90}$/i.test(action)) return reply({ error: 'Invalid audit action' }, 400)
    let query = actor.admin.from('admin_audit_logs')
      .select('id,action,target_type,target_id,details,request_id,ip_address,created_at,actor:users!admin_audit_logs_actor_user_id_fkey(username,display_name)')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(250)
    if (action) query = query.eq('action', action)
    if (search) {
      const value = pattern(search)
      query = query.or(`action.ilike.${value},target_id.ilike.${value},request_id.ilike.${value}`)
    }
    const result = await query
    if (result.error) return reply({ error: 'Audit events could not be loaded' }, 503)
    const events = (result.data ?? []).map(event => ({ ...event, details: JSON.stringify(event.details ?? {}, null, 2) }))
    return reply({ events, actions: [...new Set(events.map(event => event.action))].sort() })
  }
  if (kind !== 'notifications') return reply({ error: 'Choose an operations view' }, 400)
  const type = params.get('type')
  const start = date(params.get('from'))
  const end = date(params.get('to'))
  if (type && !types.has(type) || start === undefined || end === undefined || start && end && start > end) {
    return reply({ error: 'Check the notification filters' }, 400)
  }
  let notifications = actor.supabase.from('notifications')
    .select('id,type,message,body,read,created_at,user:users!notifications_user_id_fkey(username),actor:users!notifications_actor_id_fkey(username)')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200)
  if (type) notifications = notifications.eq('type', type)
  if (start) notifications = notifications.gte('created_at', start.toISOString())
  if (end) notifications = notifications.lt('created_at', new Date(end.getTime() + 86_400_000).toISOString())
  if (search) {
    const value = pattern(search)
    const users = await actor.supabase.from('users').select('id').or(`username.ilike.${value},display_name.ilike.${value}`).order('id').limit(200)
    if (users.error) return reply({ error: 'Notification member search could not be loaded' }, 503)
    const ids = (users.data ?? []).map(person => person.id)
    if (!ids.length) return reply({ notifications: [] })
    const scope = ids.join(',')
    notifications = notifications.or(`user_id.in.(${scope}),actor_id.in.(${scope})`)
  }
  const result = await notifications
  return result.error ? reply({ error: 'Notifications could not be loaded' }, 503) : reply({ notifications: result.data ?? [] })
}

export async function DELETE(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  if (params.get('kind') !== 'groups' || !id || !isAccountId(id)) return reply({ error: 'Choose a valid community' }, 400)
  const removed = await actor.admin.from('groups').delete().eq('id', id).select('id').maybeSingle()
  if (removed.error) return reply({ error: 'Community could not be deleted' }, 503)
  if (!removed.data) return reply({ error: 'Community not found' }, 404)
  await writeAdminAudit(actor.admin, { actorUserId: actor.user.id, action: 'community.delete', targetType: 'group', targetId: id, request }).catch(() => undefined)
  return reply({ id: removed.data.id })
}
