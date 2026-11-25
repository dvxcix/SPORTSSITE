import { NextResponse } from 'next/server'
import { isAccountId, isBlockedEitherWay } from '@/lib/blocks'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { publishedPaidCommunities } from '@/lib/creatorCommunityDirectory'
import { POST_WITH_AUTHOR, type FeedPost } from '@/lib/feedQuery'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { isGuestVisible, mobilePost, nativeAnonymousClient } from '@/lib/nativeSocial'
import { publicCreatorDirectory, type PublishedCreatorStore, type PublicCreatorIdentity } from '@/lib/publicCreatorDirectory'
import { attachUserReactions } from '@/lib/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'
import type { SupabaseClient } from '@supabase/supabase-js'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
const unavailable = () => reply({ error: 'Creator destination unavailable' }, 404)
const creatorFields = 'id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,is_verified,account_type'
const groupFields = 'id,name,slug,emoji,description,access_type,creator_product_id,sport,avatar_url,banner_url,member_count,owner_id,is_public'
const offerFields = 'id,creator_id,title,description,price,currency,product_type,billing_period_days,status'

function visibleSport(value: string | null, allowMlb: boolean) {
  return allowMlb || value?.trim().toUpperCase() !== 'MLB'
}

async function storefront(client: SupabaseClient, username: string, viewer?: string) {
  const { data: person, error } = await client.from('users').select(creatorFields).eq('username', username).maybeSingle()
  if (error) throw error
  if (!person || viewer && viewer !== person.id && await isBlockedEitherWay(client, viewer, person.id)) return unavailable()
  const [products, published, groups, store, posts, allowMlb, entitlements, following] = await Promise.all([
    client.from('creator_products').select(offerFields).eq('creator_id', person.id).eq('status', 'active').order('price').limit(60),
    publishedPaidCommunities({ creatorId: person.id }),
    client.from('groups').select(groupFields).eq('owner_id', person.id).order('created_at').limit(60),
    client.from('creator_storefronts').select('creator_id,name,bio,logo_url,cover_url,sports,tags,featured,featured_rank,access_mode')
      .eq('creator_id', person.id).eq('status', 'published').maybeSingle(),
    client.from('posts').select(POST_WITH_AUTHOR).eq('author_id', person.id).eq('visibility', 'public')
      .is('group_id', null).eq('is_premium', false).order('created_at', { ascending: false }).limit(6),
    canViewMlb(client, viewer),
    viewer ? client.from('creator_entitlements').select('product_id,status,current_period_end').eq('user_id', viewer).eq('creator_id', person.id) : null,
    viewer && viewer !== person.id ? client.from('follows').select('following_id').eq('follower_id', viewer).eq('following_id', person.id).maybeSingle() : null,
  ])
  if (products.error || groups.error || store.error || entitlements?.error || following?.error) throw Error('Storefront unavailable')
  const community = [...new Map([...published, ...(groups.data ?? [])].map(group => [group.id, group])).values()]
    .filter(group => visibleSport(group.sport, allowMlb))
  const own = person.id === viewer
  if (!store.data && !['creator', 'admin'].includes(person.account_type) && !products.data?.length && !community.length && !own) return unavailable()

  const active = (entitlements?.data ?? []).filter(hasCurrentCreatorAccess).map(item => item.product_id)
  const joined = community.length && viewer ? await client.from('group_members').select('group_id')
    .eq('user_id', viewer).in('group_id', community.map(group => group.id)) : null
  if (joined?.error) throw joined.error
  const { account_type: _role, ...identity } = person
  const publishedCreator = { ...identity, creator_products: (products.data ?? []).map(product => ({
    id: product.id, title: product.title, description: product.description, price: Number(product.price), currency: product.currency,
    product_type: product.product_type, billing_period_days: product.billing_period_days,
  })) } as PublicCreatorIdentity
  const creator = publicCreatorDirectory([publishedCreator], store.data ? [{ ...store.data, creator: publishedCreator } as PublishedCreatorStore] : [])[0]
  creator.sports = creator.sports.filter(sport => visibleSport(sport, allowMlb))
  const visible = ((posts.data ?? []) as unknown as FeedPost[]).filter(post => isGuestVisible(post) && visibleSport(post.sport ?? null, allowMlb))
  const research = posts.error ? [] : await attachUserReactions((await hydrateVisibleAuthorRecords(client, visible)).posts, viewer, client, true)
  return reply({ creator, groups: community, activeProductIds: active, joinedIds: (joined?.data ?? []).map(row => row.group_id),
    following: following ? Boolean(following.data) : null, posts: research.map(mobilePost), postsUnavailable: Boolean(posts.error) })
}

async function offer(client: SupabaseClient, id: string, viewer?: string) {
  const { data: product, error } = await client.from('creator_products').select(offerFields).eq('id', id).eq('status', 'active').maybeSingle()
  if (error) throw error
  if (!product) {
    if (!viewer) return unavailable()
    const { data: paused, error } = await createAdminClient().from('creator_products').select('id,creator_id').eq('id', id).eq('status', 'paused').maybeSingle()
    if (error) throw error
    if (!paused || viewer !== paused.creator_id && await isBlockedEitherWay(client, viewer, paused.creator_id)) return unavailable()
    return reply({ offer: { id, title: 'Existing membership access', status: 'paused' }, creator: null, community: null })
  }
  if (viewer && viewer !== product.creator_id && await isBlockedEitherWay(client, viewer, product.creator_id)) return unavailable()
  const [creator, groups, allowMlb] = await Promise.all([
    client.from('users').select(creatorFields).eq('id', product.creator_id).maybeSingle(),
    publishedPaidCommunities({ creatorId: product.creator_id }), canViewMlb(client, viewer),
  ])
  if (creator.error) throw creator.error
  if (!creator.data) return unavailable()
  const { account_type: _role, ...person } = creator.data
  const community = groups.find(group => group.creator_product_id === id && visibleSport(group.sport, allowMlb)) ?? null
  return reply({ offer: { ...product, price: Number(product.price) }, creator: person, community })
}

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams
  const username = input.get('username'), id = input.get('offer')
  if ((!username && !id) || (username !== null && id !== null) || input.getAll('username').length > 1 || input.getAll('offer').length > 1 ||
      username !== null && (!/^[A-Za-z0-9._-]{1,80}$/.test(username) || username === '.' || username === '..') || id !== null && !isAccountId(id)) {
    return reply({ error: 'Invalid creator link' }, 400)
  }
  try {
    const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (account?.error) return account.error
    const client = account?.supabase ?? nativeAnonymousClient()
    return id ? await offer(client, id, account?.userId) : await storefront(client, username!, account?.userId)
  } catch {
    return reply({ error: 'Creator destination temporarily unavailable' }, 503)
  }
}
