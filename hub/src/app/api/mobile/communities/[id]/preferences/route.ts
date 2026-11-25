import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { listNativeChannels } from '@/lib/nativeChannels'
import { nativeCommunityPublishing } from '@/lib/nativeCommunityPublishing'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

type Context = { params: Promise<{ id: string }> }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { id } = await context.params
  const { supabase, userId } = account
  try {
    const access = await nativeCommunityPublishing(supabase, userId, id)
    if (access.error) return respond({ error: access.error }, access.status)
    const [group, preferences, selections, directory] = await Promise.all([
      supabase.from('groups').select('rules').eq('id', id).maybeSingle(),
      supabase.from('group_member_preferences').select('notification_level,flair,onboarding_completed_at,rules_accepted_at')
        .eq('group_id', id).eq('user_id', userId).maybeSingle(),
      supabase.from('group_channel_preferences').select('channel_id').eq('group_id', id).eq('user_id', userId),
      listNativeChannels(supabase, userId, id),
    ])
    if (group.error || !group.data || preferences.error || selections.error || 'status' in directory) throw Error('Community preferences unavailable')
    const visible = new Set(directory.channels.map(channel => channel.id))
    return respond({ rules: group.data.rules, preferences: preferences.data, channels: directory.channels,
      selected: (selections.data ?? []).map(row => row.channel_id).filter(channel => visible.has(channel)) })
  } catch { return respond({ error: 'Community preferences couldn’t load' }, 503) }
}

export async function POST(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { id } = await context.params
  const { supabase, userId } = account
  try {
    const raw = await request.text()
    if (raw.length > 4000) return respond({ error: 'Preferences are too large' }, 413)
    const body = JSON.parse(raw) as { accept?: boolean; notification?: string; flair?: string; channels?: unknown[] } | null
    if (body?.accept !== true || !['all', 'highlights', 'mentions', 'muted'].includes(body.notification ?? '') ||
        typeof body.flair !== 'string' || body.flair.trim().length > 32 || !Array.isArray(body.channels) || body.channels.length > 80 ||
        body.channels.some(channel => typeof channel !== 'string' || !isAccountId(channel))) return respond({ error: 'Check your community preferences' }, 400)
    const access = await nativeCommunityPublishing(supabase, userId, id)
    if (access.error) return respond({ error: access.error }, access.status)
    const directory = await listNativeChannels(supabase, userId, id)
    if ('status' in directory) return respond({ error: 'Channels unavailable' }, directory.status)
    const visible = new Set(directory.channels.map(channel => channel.id))
    if (body.channels.some(channel => !visible.has(channel))) return respond({ error: 'Channel selections are now out of date' }, 409)
    const { error } = await supabase.rpc('save_group_member_onboarding', { p_group_id: id, p_rules_accepted: true,
      p_notification_level: body.notification, p_flair: body.flair.trim() || null, p_channel_ids: [...new Set(body.channels)] })
    return error ? respond({ error: 'Preferences couldn’t be saved' }, 403) : respond({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) return respond({ error: 'Invalid community preferences' }, 400)
    return respond({ error: 'Community preferences couldn’t be saved' }, 503)
  }
}
