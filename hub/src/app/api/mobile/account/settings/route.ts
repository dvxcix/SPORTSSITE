import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { createAdminClient } from '@/lib/supabase/admin'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const profileFields = 'username,display_name,bio,location,website,avatar_url,banner_url,is_private,allow_dms,hide_win_rate,notification_settings,notification_delivery_settings'

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { data, error } = await createAdminClient().from('users').select(profileFields).eq('id', account.userId).maybeSingle()
  if (error || !data) return respond({ error: 'Settings are temporarily unavailable' }, 503)
  return respond({
    profile: {
      username: data.username, displayName: data.display_name, bio: data.bio, location: data.location, website: data.website,
      avatarUrl: data.avatar_url, bannerUrl: data.banner_url,
    },
    privacy: { isPrivate: data.is_private, allowMessages: data.allow_dms, hideWinRate: data.hide_win_rate },
    notifications: { settings: data.notification_settings ?? {}, delivery: data.notification_delivery_settings ?? {} },
  })
}

export async function PATCH(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 8192) return respond({ error: 'Invalid settings' }, 400)
    body = JSON.parse(raw)
    if (!body || Array.isArray(body) || typeof body !== 'object') throw Error()
  } catch {
    return respond({ error: 'Invalid settings' }, 400)
  }
  const fields: Record<string, string | boolean> = {}
  if (body.kind === 'privacy') {
    for (const [key, column] of [['isPrivate', 'is_private'], ['allowMessages', 'allow_dms'], ['hideWinRate', 'hide_win_rate']]) {
      if (typeof body[key] !== 'boolean') return respond({ error: 'Invalid privacy setting' }, 400)
      fields[column] = body[key]
    }
  } else if (body.kind === 'profile') {
    for (const [key, column, limit] of [['displayName', 'display_name', 60], ['bio', 'bio', 280],
      ['location', 'location', 100], ['website', 'website', 2048]] as const) {
      const value = body[key]
      if (typeof value !== 'string' || value.length > limit) return respond({ error: 'Check your profile details' }, 400)
      fields[column] = value.trim()
    }
    if (fields.website && typeof fields.website === 'string') {
      try {
        const url = new URL(fields.website)
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error()
      } catch {
        return respond({ error: 'Enter a valid website address' }, 400)
      }
    }
  } else {
    return respond({ error: 'Invalid settings type' }, 400)
  }
  const { data, error } = await account.supabase.from('users').update(fields).eq('id', account.userId).select('id').maybeSingle()
  if (error || !data?.id) return respond({ error: 'Settings could not be saved' }, 503)
  return respond({ ok: true })
}
