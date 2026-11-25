import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { writeAdminAudit } from '@/lib/adminAudit'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { headers, status })
const listingStates = new Set(['published', 'unlisted', 'removed'])

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const query = new URL(request.url).searchParams
  const status = query.get('status')
  const term = (query.get('q') ?? '').trim()
  if (status !== null && !listingStates.has(status) || term.length > 80 || /[\x00-\x1f]/.test(term)) {
    return reply({ error: 'Check the marketplace filters' }, 400)
  }
  let listings = actor.admin.from('matrix_marketplace_listings')
    .select('id,title,description,tags,matrix_type,color,status,copy_count,published_at,updated_at,author:users!matrix_marketplace_listings_author_id_fkey(username,display_name,avatar_url,is_verified)')
    .order('published_at', { ascending: false, nullsFirst: false }).order('id').limit(200)
  if (status) listings = listings.eq('status', status)
  if (term) {
    const like = JSON.stringify(`%${term.replace(/[\\%_]/g, '\\$&')}%`)
    listings = listings.or(`title.ilike.${like},description.ilike.${like}`)
  }
  const result = await listings
  return result.error ? reply({ error: 'Marketplace publications could not be loaded' }, 503) : reply({ listings: result.data ?? [] })
}

export async function PATCH(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const raw = await request.text()
  if (raw.length > 2048) return reply({ error: 'That publication change is invalid' }, 400)
  const choice = await new Response(raw).json().catch(() => null)
  const id = choice?.id
  const expected = choice?.expectedStatus
  const updatedAt = choice?.expectedUpdatedAt
  const status = choice?.status
  if (!isAccountId(id) || typeof expected !== 'string' || !listingStates.has(expected) ||
      typeof updatedAt !== 'string' || updatedAt.length > 64 || !Number.isFinite(Date.parse(updatedAt)) ||
      (expected === 'removed' ? status !== 'published' : status !== 'removed')) {
    return reply({ error: 'That publication change is invalid' }, 400)
  }
  const result = await actor.admin.from('matrix_marketplace_listings')
    .update({ status, moderation_note: status === 'removed' ? 'Removed by SlipSurge moderation.' : null })
    .eq('id', id).eq('status', expected).eq('updated_at', updatedAt).select('id,status,updated_at').maybeSingle()
  if (result.error) return reply({ error: 'The publication change could not be saved' }, 503)
  if (!result.data) return reply({ error: 'The listing changed. Reload it before retrying.' }, 409)
  await writeAdminAudit(actor.admin, { actorUserId: actor.user.id, targetType: 'matrix_marketplace_listing', targetId: id,
    action: status === 'removed' ? 'matrix_marketplace.removed' : 'matrix_marketplace.restored',
    details: { previous_status: expected, status }, request }).catch(() => undefined)
  revalidatePath('/admin/marketplace')
  revalidatePath('/marketplace')
  return reply({ listing: result.data })
}
