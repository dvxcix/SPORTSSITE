import { NextResponse } from 'next/server'
import { socialPlatformColumns, socialPlatformKey } from '@/lib/nativeSocialPlatforms'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { createAdminClient } from '@/lib/supabase/admin'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const profileFields = 'username,display_name,bio,location,website,avatar_url,banner_url,is_private,allow_dms,hide_win_rate,notification_settings,notification_delivery_settings,social_links'

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const [{ data, error }, platforms] = await Promise.all([
    createAdminClient().from('users').select(profileFields).eq('id', account.userId).maybeSingle(),
    account.supabase.from('social_platforms').select(socialPlatformColumns).order('sort_order').order('name').order('id'),
  ])
  if (error || !data) return respond({ error: 'Settings are temporarily unavailable' }, 503)
  const socialLinks = Object.fromEntries((platforms.data ?? []).flatMap(platform => {
    const value = data.social_links && Object.hasOwn(data.social_links, platform.key) ? data.social_links[platform.key] : null
    return typeof value === 'string' && value.length <= 100 ? [[platform.key, value]] : []
  }))
  return respond({
    profile: {
      username: data.username, displayName: data.display_name, bio: data.bio, location: data.location, website: data.website,
      avatarUrl: data.avatar_url, bannerUrl: data.banner_url,
      socialPlatforms: platforms.error ? null : platforms.data ?? [], socialLinks,
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
  const fields: Record<string, string | boolean | Record<string, unknown> | null> = {}
  let observedLinks: Record<string, unknown> | undefined
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
    if (body.username !== undefined) {
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
      if (!/^[a-z0-9._]{2,30}$/.test(username)) return respond({ error: 'Use 2–30 letters, numbers, periods or underscores' }, 400)
      fields.username = username
    }
    for (const [key, column, folder] of [['avatarUrl', 'avatar_url', 'avatars'], ['bannerUrl', 'banner_url', 'banners']] as const) {
      const edit = body[key]
      if (edit === undefined) continue
      if (edit === null) { fields[column] = null; continue }
      try {
        if (typeof edit !== 'string' || edit.length > 2048) throw Error()
        const url = new URL(edit)
        const allowed = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
        const root = `/storage/v1/object/public/media/${folder}/${account.userId}/`
        if (url.origin !== allowed.origin || url.username || url.password || url.search || url.hash ||
          !url.pathname.startsWith(root) || !/^[0-9a-f-]{36}\.(?:gif|webp|png|jpe?g)$/i.test(url.pathname.slice(root.length))) throw Error()
        fields[column] = url.href
      } catch { return respond({ error: 'Choose an uploaded profile photo' }, 400) }
    }
    if (fields.website && typeof fields.website === 'string') {
      try {
        const url = new URL(fields.website)
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error()
      } catch {
        return respond({ error: 'Enter a valid website address' }, 400)
      }
    }
    if (body.socialLinks !== undefined) {
      const changes = body.socialLinks
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return respond({ error: 'Check your social links' }, 400)
      const entries = Object.entries(changes)
      if (!entries.length || entries.length > 64 || entries.some(([key, change]) => {
        if (!socialPlatformKey.test(key) || !change || typeof change !== 'object' || Array.isArray(change)) return true
        const field = change as Record<string, unknown>
        return [field.before, field.handle].some(value => typeof value !== 'string' || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value))
      })) return respond({ error: 'Check your social links' }, 400)

      const [platforms, profile] = await Promise.all([
        account.supabase.from('social_platforms').select('key').in('key', entries.map(([key]) => key)),
        account.supabase.from('users').select('social_links').eq('id', account.userId).maybeSingle(),
      ])
      if (platforms.error || profile.error || !profile.data) return respond({ error: 'Social links couldn’t load' }, 503)
      if (platforms.data.length !== entries.length) return respond({ error: 'A platform was removed. Reload your profile.' }, 409)
      const current = profile.data.social_links
      if (!current || typeof current !== 'object' || Array.isArray(current)) return respond({ error: 'Saved social links couldn’t load' }, 503)
      observedLinks = current as Record<string, unknown>
      const saved = { ...observedLinks }
      for (const [key, change] of entries as [string, { before: string; handle: string }][]) {
        const previous = Object.hasOwn(saved, key) && typeof saved[key] === 'string' ? saved[key] : ''
        if (previous !== change.before) return respond({ error: 'A social link was updated on another device' }, 409)
        const handle = change.handle.trim()
        if (handle) Object.defineProperty(saved, key, { value: handle, writable: true, enumerable: true, configurable: true })
        else delete saved[key]
      }
      fields.social_links = saved
    }
  } else {
    return respond({ error: 'Invalid settings type' }, 400)
  }
  let update = account.supabase.from('users').update(fields).eq('id', account.userId)
  if (observedLinks) update = update.eq('social_links', JSON.stringify(observedLinks))
  const { data, error } = await update.select('id').maybeSingle()
  if (error?.code === '23505' && fields.username) return respond({ error: 'That username is taken' }, 409)
  if (!error && !data && observedLinks) return respond({ error: 'Social links changed while saving. Reload your profile.' }, 409)
  if (error || !data?.id) return respond({ error: 'Settings could not be saved' }, 503)
  return respond({ ok: true })
}
