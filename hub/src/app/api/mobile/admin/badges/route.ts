import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const badgeFields = 'id,name,description,icon_url,card_image_url,created_at'
const personFields = 'id,username,display_name,avatar_url,is_verified'
const idValue = (value: unknown): value is string => typeof value === 'string' && isAccountId(value)
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value.trim() : null
const unavailable = () => reply({ error: 'Badge information could not be confirmed' }, 503)
const missing = () => reply({ error: 'Badge not found' }, 404)

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const params = new URL(request.url).searchParams
  const view = params.get('view') ?? 'index'
  const offset = Number(params.get('offset') ?? '0')
  if (!Number.isInteger(offset) || offset < 0 || offset > 50_000) return reply({ error: 'Invalid badge position' }, 400)
  if (view === 'index') {
    const result = await actor.admin.from('badges').select(`${badgeFields},user_badges(count)`)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 49)
    return result.error ? unavailable() : reply({ badges: result.data ?? [], next: (result.data?.length ?? 0) === 50 ? offset + 50 : null })
  }
  const id = params.get('id')
  if (!idValue(id)) return reply({ error: 'Choose a valid badge' }, 400)
  const badge = await actor.admin.from('badges').select('id').eq('id', id).maybeSingle()
  if (badge.error) return unavailable()
  if (!badge.data) return missing()
  if (view === 'members') {
    const result = await actor.admin.from('user_badges').select(`user_id,person:users!user_badges_user_id_fkey(${personFields})`)
      .eq('badge_id', id).order('user_id').range(offset, offset + 49)
    return result.error ? unavailable() : reply({ members: (result.data ?? []).flatMap(row => row.person ? [row.person] : []),
      next: (result.data?.length ?? 0) === 50 ? offset + 50 : null })
  }
  if (view === 'search') {
    const term = (params.get('q') ?? '').trim()
    if (term.length < 2) return reply({ members: [] })
    if (term.length > 60 || /[\x00-\x1f]/.test(term)) return reply({ error: 'Enter a valid member name' }, 400)
    const pattern = JSON.stringify(`%${term.replace(/[\\%_]/g, '\\$&')}%`)
    const people = await actor.admin.from('users').select(personFields)
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`).order('username').limit(20)
    if (people.error) return unavailable()
    const ids = (people.data ?? []).map(person => person.id)
    if (!ids.length) return reply({ members: [] })
    const current = await actor.admin.from('user_badges').select('user_id').eq('badge_id', id).in('user_id', ids)
    if (current.error) return unavailable()
    const awarded = new Set((current.data ?? []).map(row => row.user_id))
    return reply({ members: (people.data ?? []).filter(person => !awarded.has(person.id)) })
  }
  if (view !== 'bulk') return reply({ error: 'Choose a valid badge view' }, 400)
  const people = await actor.admin.from('users').select('id').order('id').limit(1000)
  if (people.error) return unavailable()
  const ids = (people.data ?? []).map(person => person.id)
  const awarded = new Set<string>()
  for (let index = 0; index < ids.length; index += 100) {
    const result = await actor.admin.from('user_badges').select('user_id').eq('badge_id', id).in('user_id', ids.slice(index, index + 100))
    if (result.error) return unavailable()
    for (const row of result.data ?? []) awarded.add(row.user_id)
  }
  return reply({ eligible: ids.filter(value => !awarded.has(value)) })
}

export async function POST(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const input: Record<string, unknown> | null = await request.json().catch(() => null)
  if (!input || !idValue(input.id)) return reply({ error: 'Choose a valid badge' }, 400)
  const id = input.id
  const client = actor.admin
  if (input.action === 'delete') {
    const result = await client.from('badges').delete().eq('id', id).select('id').maybeSingle()
    return result.error ? unavailable() : result.data ? reply({ id }) : missing()
  }
  if (input.action === 'revoke' || input.action === 'award' || input.action === 'awardBulk') {
    const members = input.action === 'awardBulk' ? input.members : [input.member]
    if (!Array.isArray(members) || members.length < 1 || members.length > 1000 || !members.every(idValue)) {
      return reply({ error: 'Choose valid badge recipients' }, 400)
    }
    const exists = await client.from('badges').select('id').eq('id', id).maybeSingle()
    if (exists.error) return unavailable()
    if (!exists.data) return missing()
    if (input.action === 'revoke') {
      const result = await client.from('user_badges').delete().eq('badge_id', id).eq('user_id', members[0])
      return result.error ? unavailable() : reply({ id })
    }
    const ids = [...new Set(members)]
    const rows = ids.map(user_id => ({ user_id, badge_id: id, awarded_by: actor.user.id }))
    const result = await client.from('user_badges').upsert(rows, { onConflict: 'user_id,badge_id', ignoreDuplicates: true }).select('id')
    return result.error ? unavailable() : reply({ id, awarded: result.data?.length ?? 0 })
  }
  const create = input.action === 'create'
  if (!create && input.action !== 'edit') return reply({ error: 'Choose a badge action' }, 400)
  const name = text(input.name, 80)
  const description = text(input.description, 500)
  const icon = input.icon ?? null
  const card = input.card ?? null
  if (!name || !description || ((create || icon !== null) && !isOwnedNativeMedia(icon, actor.user.id, 'badges'))
    || (card !== null && !isOwnedNativeMedia(card, actor.user.id, 'badge-cards'))) return reply({ error: 'Check the badge name, description and images' }, 400)
  if (!create) {
    const expected = input.expected as {name?: unknown; description?: unknown; icon?: unknown; card?: unknown} | undefined
    if (typeof expected?.name !== 'string' || typeof expected.description !== 'string' || typeof expected.icon !== 'string'
      || (expected.card !== null && typeof expected.card !== 'string') || expected.name.length > 250 || expected.description.length > 2000
      || expected.icon.length > 2048 || typeof expected.card === 'string' && expected.card.length > 2048) {
      return reply({ error: 'Reload the badge before editing' }, 400)
    }
    const changes = { name, description, ...(icon ? { icon_url: icon } : {}),
      ...(card || input.removeCard === true ? { card_image_url: card } : {}) }
    const update = client.from('badges').update(changes).eq('id', id).eq('name', expected.name)
      .eq('description', expected.description).eq('icon_url', expected.icon)
    const result = await (expected.card === null ? update.is('card_image_url', null) : update.eq('card_image_url', expected.card)).select('id').maybeSingle()
    if (result.error?.code === '23505') return reply({ error: 'That badge name is already in use' }, 409)
    if (result.error) return unavailable()
    return result.data ? reply({ id }) : reply({ error: 'This badge changed. Reload before saving.' }, 409)
  }
  const result = await client.from('badges').insert({ id, name, description, icon_url: icon, card_image_url: card }).select('id').single()
  if (!result.error) return reply({ id }, 201)
  if (result.error.code !== '23505') return unavailable()
  const prior = await client.from('badges').select('name,description,icon_url,card_image_url').eq('id', id).maybeSingle()
  if (prior.error) return unavailable()
  return prior.data?.name === name && prior.data.description === description && prior.data.icon_url === icon && prior.data.card_image_url === card
    ? reply({ id }) : reply({ error: 'That badge name is already in use' }, 409)
}
