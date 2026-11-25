import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
const sports = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA'])
const icons = new Set(['👥', '🏆', '🔥', '⚡', '🎯', '💰', '🎲', '🏈', '⚾', '🏀', '🏒', '⚽', '🥊', '🎉', '💎', '🚀', '👑', '🦁', '🎰'])

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const raw = await request.text()
  if (raw.length > 8192) return reply({ error: 'Community details are too long' }, 400)
  const body = await new Response(raw).json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const description = typeof body?.description === 'string' ? body.description.trim() || null : null
  const sport = body?.sport ?? null, product = body?.offerId ?? null
  const emoji = body?.emoji, avatar = body?.avatarUrl ?? null, banner = body?.bannerUrl ?? null
  if (name.length < 2 || name.length > 60 || !slug || (description?.length ?? 0) > 280 ||
      /[\x00-\x1f]/.test(name) || !icons.has(emoji) || typeof body?.isPublic !== 'boolean' ||
      sport !== null && !sports.has(sport) || product !== null && !isAccountId(product) ||
      avatar !== null && !isOwnedNativeMedia(avatar, userId, 'avatars') || banner !== null && !isOwnedNativeMedia(banner, userId, 'banners')) {
    return reply({ error: 'Check your community name, details and artwork' }, 400)
  }
  if (sport === 'MLB' && !await canViewMlb(supabase, userId)) return reply({ error: 'MLB communities are paused' }, 403)
  const visible = product === null && body.isPublic
  const values = { p_name: name, p_description: description, p_sport: sport, p_is_public: visible }
  const result = await supabase.rpc('create_community_group', { ...values, p_slug: slug, p_emoji: emoji, p_creator_product_id: product })
  let created = Array.isArray(result.data) ? result.data[0] : result.data
  let existing = false
  let targetAvatar = avatar, targetBanner = banner
  let needsBranding = Boolean(avatar || banner)
  if (result.error?.code === '23505') {
    const prior = await supabase.from('groups').select('id,name,description,sport,emoji,is_public,creator_product_id,avatar_url,banner_url')
      .eq('owner_id', userId).eq('slug', slug).maybeSingle()
    if (prior.error) return reply({ error: 'Check your communities before trying again' }, 503)
    const group = prior.data
    if (!group || group.name !== name || group.description !== description || group.sport !== sport || group.emoji !== emoji ||
        group.is_public !== visible || group.creator_product_id !== product) return reply({ error: 'That community name is already taken' }, 409)
    created = { group_id: group.id, group_slug: slug }
    existing = true
    if (group.avatar_url && avatar && group.avatar_url !== avatar || group.banner_url && banner && group.banner_url !== banner) {
      return reply({ id: created.group_id, slug, existing, artworkSaved: false })
    }
    targetAvatar = group.avatar_url ?? avatar
    targetBanner = group.banner_url ?? banner
    needsBranding = targetAvatar !== group.avatar_url || targetBanner !== group.banner_url
  } else if (result.error?.code === '54000') {
    return reply({ error: 'Community creation limit reached. Try again later.' }, 429)
  } else if (result.error?.code === '42501') {
    return reply({ error: 'This membership is unavailable for a community' }, 403)
  } else if (result.error || !isAccountId(created?.group_id) || created.group_slug !== slug) {
    return reply({ error: 'The community could not be created' }, 503)
  }

  let artworkSaved = true
  if (needsBranding) {
    const branding = await supabase.rpc('update_community_group', { ...values, p_group_id: created.group_id, p_avatar_url: targetAvatar, p_banner_url: targetBanner })
    artworkSaved = !branding.error
  }
  return reply({ id: created.group_id, slug, existing, artworkSaved }, existing ? 200 : 201)
}
