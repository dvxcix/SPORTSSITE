import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { communityContains, nativeCommunitySettings, nativeCommunitySettingsAccess } from '@/lib/nativeCommunitySettings'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'
import { notify } from '@/lib/notify'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

type Context = { params: Promise<{ id: string }> }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const kinds = ['text', 'live', 'picks', 'announcements']
const memberRoles = ['admin', 'moderator', 'analyst', 'subscriber', 'member']
const permissions = ['view_channels', 'send_messages', 'manage_messages', 'manage_channels', 'manage_roles', 'manage_members', 'create_invites']
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function GET(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { id } = await context.params
  if (!isAccountId(id)) return respond({ error: 'Community unavailable' }, 404)
  try {
    const { supabase, userId } = account
    const access = await nativeCommunitySettingsAccess(supabase, userId, id)
    if (!access) return respond({ error: 'Community unavailable' }, 404)
    const query = new URL(request.url).searchParams
    if (query.has('q')) {
      if (!access.invite) return respond({ error: 'Invite permission required' }, 403)
      const term = text(query.get('q')).slice(0, 48).replace(/[%_,().\\]/g, '')
      if (term.length < 2) return respond({ users: [] })
      const columns = 'id,username,display_name,avatar_url,is_verified'
      const [handles, names] = await Promise.all([
        supabase.from('users').select(columns).neq('id', userId).ilike('username', `%${term}%`).limit(12),
        supabase.from('users').select(columns).neq('id', userId).ilike('display_name', `%${term}%`).limit(12),
      ])
      if (handles.error || names.error) throw Error('Member search unavailable')
      const users = [...new Map([...handles.data, ...names.data].map(person => [person.id, person])).values()]
      if (!users.length) return respond({ users: [] })
      const ids = users.map(person => person.id)
      const [{ data: members, error: memberError }, { data: invitations, error: inviteError }] = await Promise.all([
        supabase.from('group_members').select('user_id').eq('group_id', id).in('user_id', ids),
        supabase.from('group_invites').select('invited_user_id').eq('group_id', id).eq('status', 'pending').in('invited_user_id', ids),
      ])
      if (memberError || inviteError) throw Error('Invitation status unavailable')
      return respond({ users: users.filter(person => !members?.some(member => member.user_id === person.id)).slice(0, 12),
        pending: (invitations ?? []).map(invite => invite.invited_user_id) })
    }
    if (!access.owner && !access.memberManagement && !access.channelManagement && !access.roleManagement && !access.invite) {
      return respond({ error: 'Community permission required' }, 403)
    }
    return respond(await nativeCommunitySettings(supabase, access))
  } catch { return respond({ error: 'Community settings couldn’t load' }, 503) }
}

export async function POST(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { id } = await context.params
  if (!isAccountId(id)) return respond({ error: 'Community unavailable' }, 404)
  const raw = await request.text().catch(() => '')
  if (raw.length > 12_000) return respond({ error: 'Settings are too large' }, 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error()
  } catch { return respond({ error: 'Invalid community setting' }, 400) }

  try {
    const { supabase, userId } = account
    const access = await nativeCommunitySettingsAccess(supabase, userId, id)
    if (!access) return respond({ error: 'Community unavailable' }, 404)
    const action = body.action, name = text(body.name), description = text(body.description), icon = text(body.icon) || '#'
    const channel = typeof body.channel === 'string' ? body.channel : '', roleId = typeof body.roleId === 'string' ? body.roleId : ''
    const user = typeof body.user === 'string' && isAccountId(body.user) ? body.user : null
    const saved = (result: { error: unknown }) => result.error ? respond({ error: 'Community change could not be confirmed' }, 403) : respond({ ok: true })

    if (action === 'rules' && access.owner) {
      const rules = text(body.rules)
      if (rules.length > 4000) return respond({ error: 'Community rules exceed 4,000 characters' }, 400)
      return saved(await supabase.rpc('set_community_group_rules', { p_group_id: id, p_rules: rules || null }))
    }
    if (action === 'overview' && access.owner) {
      const sport = text(body.sport).toUpperCase()
      const photos = [['avatar', 'avatars', access.group.avatar_url], ['banner', 'banners', access.group.banner_url]] as const
      if (name.length < 2 || name.length > 60 || description.length > 280 || typeof body.public !== 'boolean' || sport === 'MLB' && !access.allowMlb ||
        photos.some(([key, kind, current]) => body[key] != null && body[key] !== current && !isOwnedNativeMedia(body[key], userId, kind))) {
        return respond({ error: 'Check the community details' }, 400)
      }
      return saved(await supabase.rpc('update_community_group', { p_group_id: id, p_name: name, p_description: description || null,
        p_sport: sport || null, p_avatar_url: body.avatar === undefined ? access.group.avatar_url : body.avatar,
        p_banner_url: body.banner === undefined ? access.group.banner_url : body.banner, p_is_public: body.public }))
    }
    if ((action === 'channel-create' || action === 'channel-edit' || action === 'channel-delete') && access.channelManagement) {
      if (action !== 'channel-create' && !await communityContains(supabase, id, 'channels', channel)) return respond({ error: 'Channel unavailable' }, 404)
      if (action === 'channel-delete') return saved(await supabase.rpc('delete_group_channel', { p_channel_id: channel }))
      const kind = text(body.channelKind)
      if (name.length < 2 || name.length > 50 || description.length > 280 || icon.length > 12 || !kinds.includes(kind)) return respond({ error: 'Invalid channel details' }, 400)
      const values = { p_name: name, p_description: description || null, p_icon: icon, p_channel_kind: kind }
      return saved(action === 'channel-create' ? await supabase.rpc('create_group_channel', { p_group_id: id, ...values }) :
        await supabase.rpc('update_group_channel', { p_channel_id: channel, ...values }))
    }
    if (action === 'invite' && access.invite && user && user !== userId) {
      const pending = await supabase.from('group_invites').select('id').eq('group_id', id)
        .eq('invited_user_id', user).eq('status', 'pending').maybeSingle()
      if (pending.error) throw Error('Invitation status unavailable')
      if (pending.data) return respond({ ok: true })
      const result = await supabase.rpc('invite_community_member', { p_group_id: id, p_invited_user_id: user })
      if (!result.error && result.data === true) await notify(supabase, { userId: user, actorId: userId, type: 'group_invite',
        message: `invited you to join ${access.group.name}`, link: `/groups/${encodeURIComponent(access.group.slug)}`, targetId: id, targetType: 'group' })
      return saved(result)
    }
    if (action === 'member-remove' && access.memberManagement && user) return saved(await supabase.rpc('remove_group_member', { p_group_id: id, p_user_id: user }))
    if (action === 'member-role' && access.owner && user && memberRoles.includes(text(body.role))) {
      return saved(await supabase.rpc('set_group_member_role', { p_group_id: id, p_user_id: user, p_role: body.role }))
    }
    if (access.roleManagement && typeof action === 'string' && action.startsWith('role-')) {
      if (action !== 'role-create' && !await communityContains(supabase, id, 'community_roles', roleId)) return respond({ error: 'Role unavailable' }, 404)
      if (action === 'role-delete') return saved(await supabase.rpc('delete_community_role', { p_role_id: roleId }))
      if (action === 'role-assign' && user && typeof body.enabled === 'boolean') {
        return saved(await supabase.rpc('set_community_member_role', { p_group_id: id, p_user_id: user, p_role_id: roleId, p_enabled: body.enabled }))
      }
      if (action === 'role-override' && await communityContains(supabase, id, 'channels', channel)) {
        const flags = [body.canView, body.canSend, body.canManageMessages]
        if (flags.some(flag => flag != null && typeof flag !== 'boolean')) return respond({ error: 'Invalid channel permissions' }, 400)
        return saved(await supabase.rpc('set_channel_role_override', { p_channel_id: channel, p_role_id: roleId,
          p_can_view: flags[0] ?? null, p_can_send: flags[1] ?? null, p_can_manage_messages: flags[2] ?? null }))
      }
      const color = text(body.color)
      if (name.length < 2 || name.length > 32 || !/^#[0-9a-f]{6}$/i.test(color)) return respond({ error: 'Check the role name and color' }, 400)
      if (action === 'role-create') return saved(await supabase.rpc('create_community_role', { p_group_id: id, p_name: name, p_color: color }))
      if (action === 'role-edit') {
        if (!body.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) return respond({ error: 'Invalid role permissions' }, 400)
        const flags = Object.entries(body.permissions)
        if (flags.some(([key, flag]) => !permissions.includes(key) || typeof flag !== 'boolean')) return respond({ error: 'Invalid role permissions' }, 400)
        return saved(await supabase.rpc('update_community_role', { p_role_id: roleId, p_name: name, p_color: color, p_permissions: body.permissions }))
      }
    }
    return respond({ error: 'Community permission required' }, 403)
  } catch { return respond({ error: 'Community change could not be confirmed' }, 503) }
}
