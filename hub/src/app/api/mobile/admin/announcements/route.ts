import { NextResponse } from 'next/server'
import { BANNER_PRESETS } from '@/lib/banner'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const version = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
const cut = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value.trim() : null
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)
const conflict = () => reply({ error: 'This announcement changed. Reload before saving.' }, 409)

function validLink(value: string, relative: boolean) {
  if (relative && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\u0000-\u0020]/.test(value)) return true
  try {
    const url = new URL(value)
    return ((relative && url.protocol === 'http:') || url.protocol === 'https:') && !!url.hostname && !url.username && !url.password
  } catch { return false }
}

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const { admin } = actor
  const [banner, entries] = await Promise.all([
    admin.from('site_banner').select('*').eq('id', 1).maybeSingle(),
    admin.from('changelog_entries').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }),
  ])
  if (banner.error || entries.error) return reply({ error: 'Announcements are unavailable' }, 503)
  return reply({ banner: banner.data, entries: entries.data ?? [], presets: BANNER_PRESETS })
}

export async function PATCH(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const { admin, user } = actor
  const body: Record<string, unknown> | null = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return reply({ error: 'Invalid announcement' }, 400)
  const updated_at = new Date().toISOString()
  const expected = body.expectedUpdatedAt

  if (body.kind === 'banner') {
    const message = cut(body.message, 280)
    const link = cut(body.linkUrl, 2000)
    const label = cut(body.linkLabel, 150)
    if (message === null || link === null || label === null || (link && !validLink(link, true)) ||
      !hex(body.background) || !hex(body.foreground) || typeof body.active !== 'boolean' ||
      typeof body.dismissible !== 'boolean' || !version(expected)) return reply({ error: 'Check the message, colors and link.' }, 400)
    const result = await admin.from('site_banner').update({ message, bg_color: body.background, text_color: body.foreground,
      is_active: body.active, dismissible: body.dismissible, link_url: link || null, link_label: label || null, updated_at })
      .eq('id', 1).eq('updated_at', expected).select('*').maybeSingle()
    if (result.error) return reply({ error: 'The banner could not be saved' }, 503)
    return result.data ? reply({ banner: result.data }) : conflict()
  }

  if (typeof body.id !== 'string' || !isAccountId(body.id)) return reply({ error: 'Choose a valid release' }, 400)
  if (body.kind === 'remove') {
    if (!version(expected) || typeof body.expectedActive !== 'boolean') return reply({ error: 'Reload before deleting this release' }, 400)
    const result = await admin.from('changelog_entries').delete().eq('id', body.id).eq('updated_at', expected)
      .eq('is_active', body.expectedActive).select('id').maybeSingle()
    if (result.error) return reply({ error: 'The release could not be deleted' }, 503)
    return result.data ? reply({ removed: result.data.id }) : conflict()
  }

  const title = cut(body.title, 220)
  const description = cut(body.description, 20_000)
  const instructions = cut(body.instructions, 20_000)
  const screenshots = body.screenshots
  if (body.kind !== 'release' || !title || !description || instructions === null ||
    (body.audience !== 'all' && body.audience !== 'ultimate') || typeof body.active !== 'boolean' ||
    (!version(expected) && expected !== null) || !Array.isArray(screenshots) || screenshots.length > 30 ||
    !screenshots.every(url => typeof url === 'string' && url.length <= 2048 && validLink(url, false))) {
    return reply({ error: 'Check the title, description, audience, and screenshot URLs.' }, 400)
  }

  const values = { title, description, how_to_use: instructions || null, screenshot_urls: screenshots,
    audience_tier: body.audience, is_active: body.active, updated_at }
  if (expected !== null) {
    if (typeof body.expectedActive !== 'boolean') return reply({ error: 'Reload before editing this release' }, 400)
    const result = await admin.from('changelog_entries').update(values).eq('id', body.id).eq('updated_at', expected)
      .eq('is_active', body.expectedActive).select('*').maybeSingle()
    if (result.error) return reply({ error: 'The release could not be saved' }, 503)
    return result.data ? reply({ entry: result.data }) : conflict()
  }

  const result = await admin.from('changelog_entries').insert({ ...values, id: body.id, created_by: user.id }).select('*').single()
  if (!result.error) return reply({ entry: result.data }, 201)
  if (result.error.code !== '23505') return reply({ error: 'The release could not be saved' }, 503)
  const prior = await admin.from('changelog_entries').select('*').eq('id', body.id).eq('created_by', user.id).maybeSingle()
  const previous = prior.data
  return previous && previous.title === title && previous.description === description && previous.how_to_use === values.how_to_use &&
    previous.audience_tier === values.audience_tier && previous.is_active === values.is_active &&
    JSON.stringify(previous.screenshot_urls) === JSON.stringify(values.screenshot_urls)
    ? reply({ entry: previous }) : conflict()
}
