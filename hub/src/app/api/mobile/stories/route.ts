import { NextResponse } from 'next/server'
import { getBlockedEitherWayIds, isAccountId } from '@/lib/blocks'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { isFeatureEnabledServer } from '@/lib/featureFlags.server'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'
import { nativeAnonymousClient } from '@/lib/nativeSocial'
import { requireTier } from '@/lib/requireTier'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { isStoryVideo, storyBackground, storyTextColor } from '@/lib/storyPresentation'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

type StoryPick = { sport?: string | null; legs?: { sport?: string | null }[] }
const mlb = (sport?: string | null) => typeof sport === 'string' && sport.trim().toUpperCase() === 'MLB'
const hasMlbPick = (pick?: StoryPick | null) => mlb(pick?.sport) || (Array.isArray(pick?.legs) && pick.legs.some(leg => mlb(leg?.sport)))
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  try {
    const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (account?.error) return account.error
    const client = account?.supabase ?? nativeAnonymousClient()
    const userId = account?.userId
    if (!await isFeatureEnabledServer(FEATURE_FLAGS.stories, true, { supabase: client, userId: userId ?? null })) {
      return respond({ enabled: false, canCreate: false, stories: [] })
    }
    const [allowMlb, blocked, creation] = await Promise.all([
      canViewMlb(client, userId), userId ? getBlockedEitherWayIds(client, userId) : ([] as string[]), userId ? requireTier('basic') : null,
    ])
    const { data, error } = await client.from('stories')
      .select('id,author_id,sport,pick_data,media_url,media_type,story_type,content,caption,bg_color,created_at,expires_at,author:users(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color)')
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(12)
    if (error) throw error
    const stories = data.flatMap(row => {
      const author = Array.isArray(row.author) ? row.author[0] : row.author
      const content: string | null = row.content ?? row.caption ?? null
      const sport = row.sport ?? content?.match(/^#(MLB|NBA|NFL)\b/i)?.[1]?.toUpperCase() ?? null
      if (!author?.username || blocked.includes(row.author_id) || (!allowMlb && (mlb(sport) || hasMlbPick(row.pick_data)))) return []
      return [{ id: row.id, author, sport, content, background: storyBackground(row.bg_color),
        foreground: storyTextColor(row.bg_color), media: row.media_url || null,
        video: row.story_type !== 'text' && Boolean(row.media_url) && (row.media_type === 'video' || isStoryVideo(row.media_url)),
        createdAt: row.created_at, expiresAt: row.expires_at, mine: row.author_id === userId }]
    })
    return respond({ enabled: true, canCreate: Boolean(creation?.userId && creation.userId === userId), stories })
  } catch { return respond({ error: 'Stories are temporarily unavailable' }, 503) }
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const gate = await requireTier('basic')
  if (gate.error) return gate.error
  if (gate.userId !== account.userId || !await isFeatureEnabledServer(FEATURE_FLAGS.stories, true, account)) return respond({ error: 'Stories unavailable' }, 403)
  const raw = await request.text().catch(() => '')
  if (raw.length > 5000) return respond({ error: 'Story is too large' }, 413)
  try {
    const input = JSON.parse(raw) as Record<string, unknown> | null
    const { supabase, userId } = account
    const id = typeof input?.id === 'string' && isAccountId(input.id) ? input.id : null
    const text = typeof input?.content === 'string' ? input.content.trim() : ''
    const sport = typeof input?.sport === 'string' ? input.sport : ''
    const photo = input?.photo == null ? null : isOwnedNativeMedia(input.photo, userId, 'stories') ? input.photo : null
    if (!id || (!text && !photo) || text.length > 1000 || (input?.photo != null && !photo) || !['', 'NBA', 'NFL', 'MLB'].includes(sport)) {
      return respond({ error: 'Check your story and try again' }, 400)
    }
    if ((mlb(sport) || /^#MLB\b/i.test(text)) && !await canViewMlb(supabase, userId)) return respond({ error: 'Sport unavailable' }, 403)
    const owned = () => supabase.from('stories').select('id').eq('id', id).eq('author_id', userId).maybeSingle()
    const existing = await owned()
    if (existing.error) throw existing.error
    if (existing.data) return respond({ ok: true })
    const limit = await consumeServerRateLimit(userId, 'native_story_share', 24, 3600)
    if (!limit.available) return respond({ error: 'Stories are temporarily unavailable' }, 503)
    if (!limit.allowed) return respond({ error: 'Story limit reached. Try again later.' }, 429)
    const content = [sport ? `#${sport}` : '', text].filter(Boolean).join(' ') || null
    const { error } = await supabase.from('stories').insert({ id, author_id: userId, sport: sport || null,
      story_type: photo ? 'image' : 'text', content, media_type: photo ? 'image' : 'text', media_url: photo ?? '',
      bg_color: storyBackground(typeof input?.background === 'string' ? input.background : null),
      expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    if (error?.code === '23505' && (await owned()).data) return respond({ ok: true })
    if (error) throw error
    return respond({ ok: true }, 201)
  } catch (error) {
    if (error instanceof SyntaxError) return respond({ error: 'Invalid story' }, 400)
    return respond({ error: 'Story couldn’t be saved' }, 503)
  }
}

export async function DELETE(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !isAccountId(id)) return respond({ error: 'Invalid story' }, 400)
  const { error } = await account.supabase.from('stories').delete().eq('id', id).eq('author_id', account.userId)
  return error ? respond({ error: 'Story couldn’t be removed' }, 503) : respond({ ok: true })
}
