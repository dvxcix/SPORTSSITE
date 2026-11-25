import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const emojis = 'id,code,image_url,category_id,created_at,category:custom_emoji_categories(name)'
const categories = 'id,name,sort_order'
const useCategory = (value: unknown): value is string => typeof value === 'string' && isAccountId(value)
const unavailable = () => reply({ error: 'The emoji change could not be confirmed' }, 503)

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const params = new URL(request.url).searchParams
  const after = params.get('after')
  if (after && !/^[a-z0-9_]{2,30}$/.test(after)) return reply({ error: 'Invalid emoji position' }, 400)
  let listing = actor.admin.from('custom_emojis').select(emojis).order('code').limit(101)
  if (after) listing = listing.gt('code', after)
  const [items, groups] = await Promise.all([listing, actor.admin.from('custom_emoji_categories').select(categories).order('sort_order').order('name')])
  if (items.error || groups.error) return reply({ error: 'Custom emoji could not be loaded' }, 503)
  const visible = (items.data ?? []).slice(0, 100)
  return reply({ emojis: visible, categories: groups.data ?? [], next: (items.data?.length ?? 0) > 100 ? visible.at(-1)?.code ?? null : null })
}

export async function POST(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const input: Record<string, unknown> | null = await request.json().catch(() => null)
  if (!input || !useCategory(input.id)) return reply({ error: 'Choose a valid emoji item' }, 400)
  const id = input.id
  if (input.action === 'deleteEmoji' || input.action === 'deleteCategory') {
    const table = input.action === 'deleteEmoji' ? 'custom_emojis' : 'custom_emoji_categories'
    const result = await actor.admin.from(table).delete().eq('id', id).select('id').maybeSingle()
    return result.error ? unavailable() : result.data ? reply({ id }) : reply({ error: 'The emoji item no longer exists' }, 404)
  }
  if (input.action === 'createCategory') {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name || name.length > 60) return reply({ error: 'Enter a category name' }, 400)
    const last = await actor.admin.from('custom_emoji_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    if (last.error) return unavailable()
    const order = (last.data?.sort_order ?? -1) + 1
    const created = await actor.admin.from('custom_emoji_categories').insert({ id, name, sort_order: order }).select('id').single()
    if (!created.error) return reply({ id }, 201)
    if (created.error.code !== '23505') return unavailable()
    const previous = await actor.admin.from('custom_emoji_categories').select('name').eq('id', id).maybeSingle()
    if (previous.error) return unavailable()
    return previous.data?.name === name ? reply({ id }) : reply({ error: 'That category name is already in use' }, 409)
  }
  const create = input.action === 'createEmoji'
  if (!create && input.action !== 'editEmoji') return reply({ error: 'Invalid emoji action' }, 400)
  const code = typeof input.code === 'string' ? input.code.trim().toLowerCase() : ''
  const category = input.category ?? null
  const asset = input.image ?? null
  if (!/^[a-z0-9_]{2,30}$/.test(code) || (category !== null && !useCategory(category)) ||
    ((create || asset !== null) && !isOwnedNativeMedia(asset, actor.user.id, 'emojis'))) return reply({ error: 'Check the emoji code, category and image' }, 400)
  if (category) {
    const found = await actor.admin.from('custom_emoji_categories').select('id').eq('id', category).maybeSingle()
    if (found.error) return unavailable()
    if (!found.data) return reply({ error: 'Emoji category not found' }, 404)
  }
  if (!create) {
    const expected = input.expected as {code?: unknown; category?: unknown; image?: unknown} | undefined
    if (!expected || typeof expected.code !== 'string' || typeof expected.image !== 'string' || expected.image.length > 2048
      || (expected.category !== null && !useCategory(expected.category))) return reply({ error: 'Reload the emoji before editing' }, 400)
    const changes = { code, category_id: category, ...(asset ? { image_url: asset } : {}) }
    const update = actor.admin.from('custom_emojis').update(changes).eq('id', id).eq('code', expected.code).eq('image_url', expected.image)
    const result = await (expected.category === null ? update.is('category_id', null) : update.eq('category_id', expected.category)).select('id').maybeSingle()
    if (result.error?.code === '23505') return reply({ error: 'That emoji code is already in use' }, 409)
    if (result.error) return unavailable()
    return result.data ? reply({ id }) : reply({ error: 'This emoji changed. Reload before saving.' }, 409)
  }
  const result = await actor.admin.from('custom_emojis').insert({ id, code, category_id: category, image_url: asset, uploaded_by: actor.user.id }).select('id').single()
  if (!result.error) return reply({ id }, 201)
  if (result.error.code !== '23505') return unavailable()
  const prior = await actor.admin.from('custom_emojis').select('code,category_id,image_url').eq('id', id).eq('uploaded_by', actor.user.id).maybeSingle()
  if (prior.error) return unavailable()
  return prior.data?.code === code && prior.data.category_id === category && prior.data.image_url === asset
    ? reply({ id }) : reply({ error: 'That emoji code is already in use' }, 409)
}
