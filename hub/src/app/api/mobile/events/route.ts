import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { nativeAnonymousClient } from '@/lib/nativeSocial'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const fields = 'id,title,description,location,start_date,end_date,sport,is_online,link,cover_image,going_count,interested_count,host:users(username,display_name,avatar_url,is_verified)'
const sportOptions = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA']
const attendance = new Set(['going', 'interested', 'not_going'])
const text = (input: unknown, max: number) => typeof input === 'string' && input.length <= max ? input.trim() : null
const date = (input: unknown) => typeof input === 'string' && input.length <= 40 && Number.isFinite(Date.parse(input))
  ? new Date(input).toISOString() : null
const validLink = (input: string) => {
  try {
    const url = new URL(input)
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch { return false }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const view = query.get('view') ?? 'list'
  const id = query.get('id')
  if (!['access', 'list', 'detail'].includes(view) || (view === 'detail' && (!id || !isAccountId(id)))) {
    return reply({ error: 'Choose a valid event' }, 400)
  }
  const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
  if (account?.error) return account.error
  const supabase = account?.supabase ?? nativeAnonymousClient()
  const userId = account?.userId ?? null
  const enabled = await isFeatureEnabledServer(FEATURE_FLAGS.events, false, { supabase, userId })
  if (view === 'access') return reply({ enabled })
  if (!enabled) return reply({ error: 'Events are currently unavailable' }, 403)

  if (view === 'detail') {
    const [result, response] = await Promise.all([
      supabase.from('events').select(fields).eq('id', id).maybeSingle(),
      userId ? supabase.from('event_rsvps').select('status').eq('event_id', id).eq('user_id', userId).maybeSingle() : null,
    ])
    if (result.error || response?.error) return reply({ error: 'Event could not be loaded' }, 503)
    if (!result.data) return reply({ error: 'Event not found' }, 404)
    return reply({ event: result.data, rsvp: response?.data?.status ?? null })
  }

  const now = new Date().toISOString()
  const [upcoming, past] = await Promise.all([
    supabase.from('events').select(fields).gte('start_date', now).order('start_date', { ascending: true }).order('id').limit(20),
    supabase.from('events').select(fields).lt('start_date', now).order('start_date', { ascending: false }).order('id').limit(6),
  ])
  if (upcoming.error || past.error) return reply({ error: 'Events could not be loaded' }, 503)
  return reply({ upcoming: upcoming.data ?? [], past: past.data ?? [], sports: sportOptions })
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (!await isFeatureEnabledServer(FEATURE_FLAGS.events, false, account)) return reply({ error: 'Events are currently unavailable' }, 403)
  const input: Record<string, unknown> | null = await request.json().catch(() => null)
  if (typeof input?.id !== 'string' || !isAccountId(input.id)) return reply({ error: 'Choose a valid event' }, 400)
  const { supabase, userId } = account

  if (input.kind === 'attendance') {
    const status = input.status
    if (status !== null && (typeof status !== 'string' || !attendance.has(status))) return reply({ error: 'Choose a valid RSVP' }, 400)
    const visible = await supabase.from('events').select('id').eq('id', input.id).maybeSingle()
    if (visible.error) return reply({ error: 'Event access could not be checked' }, 503)
    if (!visible.data) return reply({ error: 'Event not found' }, 404)
    const changed = status === null
      ? await supabase.from('event_rsvps').delete().eq('event_id', input.id).eq('user_id', userId)
      : await supabase.from('event_rsvps').upsert({ event_id: input.id, user_id: userId, status }, { onConflict: 'user_id,event_id' })
    if (changed.error) return reply({ error: 'Your RSVP couldn’t be saved' }, 503)
    const counts = await supabase.from('events').select(fields).eq('id', input.id).maybeSingle()
    if (counts.error || !counts.data) return reply({ error: 'Event could not be reloaded' }, 503)
    return reply({ event: counts.data, rsvp: status })
  }

  const title = text(input.title, 100)
  const description = text(input.description, 1000)
  const location = text(input.location, 500)
  const sport = text(input.sport, 20)
  const start = date(input.start)
  const end = input.end == null ? null : date(input.end)
  const link = text(input.link, 500)
  const online = input.online
  if (input.kind !== 'create' || !title || !start || description === null || location === null ||
    sport === null || (sport && !sportOptions.includes(sport)) || (input.end != null && (!end || end <= start)) ||
    typeof online !== 'boolean' || (online && (!link || !validLink(link)))) return reply({ error: 'Check the title, date and online event link' }, 400)
  const values = { host_id: userId, title, description: description || null, location: location || null, start_date: start,
    end_date: end, sport: sport || null, is_online: online, link: online ? link : null }
  const created = await supabase.from('events').insert({ id: input.id, ...values, going_count: 0, interested_count: 0 }).select('id').single()
  if (!created.error) return reply({ id: created.data.id }, 201)
  if (created.error.code !== '23505') return reply({ error: 'Event could not be created' }, 503)
  const prior = await supabase.from('events').select('id,host_id,title,description,location,start_date,end_date,sport,is_online,link')
    .eq('id', input.id).eq('host_id', userId).maybeSingle()
  const existing = prior.data
  if (existing && existing.title === title && existing.description === values.description && existing.location === values.location &&
    date(existing.start_date) === start && date(existing.end_date) === end && existing.sport === values.sport &&
    existing.is_online === online && existing.link === values.link) return reply({ id: existing.id })
  return reply({ error: 'An event already uses this draft identifier. Reopen the event list.' }, 409)
}
