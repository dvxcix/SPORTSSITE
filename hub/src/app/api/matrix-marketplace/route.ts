import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { cleanMarketplaceTags, snapshotOwnedMatrix } from '@/lib/matrixMarketplace'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const url = new URL(req.url)
  const sort = url.searchParams.get('sort') === 'popular' ? 'popular' : 'newest'
  const type = url.searchParams.get('type')
  const author = url.searchParams.get('author')?.trim()
  const mine = url.searchParams.get('mine') === '1'
  const q = url.searchParams.get('q')?.trim().slice(0, 80)
  const admin = createAdminClient()

  let query = admin
    .from('matrix_marketplace_listings')
    .select('id, author_id, source_matrix_id, title, description, tags, matrix_type, color, snapshot, copy_count, published_at, updated_at')
    .eq('status', 'published')
    .limit(48)

  if (type === 'classic' || type === 'pipeline') query = query.eq('matrix_type', type)
  if (mine) query = query.eq('author_id', gate.userId!)
  else if (author) query = query.eq('author_id', author)
  if (q) query = query.or(`title.ilike.%${q.replace(/[%_,()]/g, '')}%,description.ilike.%${q.replace(/[%_,()]/g, '')}%`)
  query = sort === 'popular'
    ? query.order('copy_count', { ascending: false }).order('published_at', { ascending: false })
    : query.order('published_at', { ascending: false })

  const { data: listings, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const authorIds = [...new Set((listings ?? []).map(row => row.author_id))]
  const [{ data: authors }, { data: follows }, { data: badgeRows }] = authorIds.length
    ? await Promise.all([
        admin.from('users').select('id, username, display_name, avatar_url, is_verified, follower_count').in('id', authorIds),
        admin.from('follows').select('following_id').eq('follower_id', gate.userId!).in('following_id', authorIds),
        admin.from('user_badges').select('user_id, badge:badges(id, name, description, icon_url, card_image_url)').in('user_id', authorIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const authorMap = new Map((authors ?? []).map(authorRow => [authorRow.id, authorRow]))
  const followingIds = new Set((follows ?? []).map(row => row.following_id))
  const badgesByAuthor = new Map<string, unknown[]>()
  for (const row of badgeRows ?? []) badgesByAuthor.set(row.user_id, [...(badgesByAuthor.get(row.user_id) ?? []), row.badge])

  return NextResponse.json({
    listings: (listings ?? []).map(listing => ({
      ...listing,
      author: authorMap.get(listing.author_id) ?? null,
      author_badges: badgesByAuthor.get(listing.author_id) ?? [],
      is_following: followingIds.has(listing.author_id),
      is_owner: listing.author_id === gate.userId,
    })),
    current_user_id: gate.userId,
  })
}

export async function POST(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const body = await req.json().catch(() => null)
  const matrixId = typeof body?.matrix_id === 'string' ? body.matrix_id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 80) : ''
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 600) : ''
  const tags = cleanMarketplaceTags(body?.tags)
  if (!matrixId || title.length < 2) return NextResponse.json({ error: 'Choose a Matrix and add a title.' }, { status: 400 })

  const admin = createAdminClient()
  const result = await snapshotOwnedMatrix(admin, matrixId, gate.userId!)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

  const listingPayload = {
    author_id: gate.userId!,
    source_matrix_id: matrixId,
    title,
    description,
    tags,
    matrix_type: result.snapshot.matrix_type,
    color: result.snapshot.color,
    snapshot: result.snapshot,
    status: 'published',
    moderation_note: null,
    published_at: new Date().toISOString(),
  }

  const { data: existing } = await admin
    .from('matrix_marketplace_listings')
    .select('id')
    .eq('author_id', gate.userId!)
    .eq('source_matrix_id', matrixId)
    .eq('status', 'published')
    .maybeSingle()

  const mutation = existing
    ? admin.from('matrix_marketplace_listings').update(listingPayload).eq('id', existing.id).select('id').single()
    : admin.from('matrix_marketplace_listings').insert(listingPayload).select('id').single()
  const { data, error } = await mutation
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ listing_id: data.id }, { status: existing ? 200 : 201 })
}
