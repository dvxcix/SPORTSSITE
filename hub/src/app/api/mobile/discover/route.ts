import { NextResponse } from 'next/server'
import { loadCommunityDirectory } from '@/lib/communityDirectoryServer'
import { loadLinkedCommunity } from '@/lib/linkedCommunityServer'
import { loadPublicCreators } from '@/lib/creatorDirectoryServer'
import { loadPublicLeaderboard } from '@/lib/leaderboardServer'
import { nativeAnonymousClient } from '@/lib/nativeSocial'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { canViewMlb } from '@/lib/mlbViewerAccess'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
export const maxDuration = 45

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const resource = query.get('resource')
  if (resource !== 'communities' && resource !== 'creators' && resource !== 'records') {
    return respond({ error: 'Invalid discovery section' }, 400)
  }
  const slug = query.get('slug')
  if (slug !== null && (resource !== 'communities' || query.getAll('slug').length !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(slug))) {
    return respond({ error: 'Invalid community link' }, 400)
  }
  try {
    const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (account?.error) return account.error
    const client = account?.supabase ?? nativeAnonymousClient()
    const user = account?.userId
    if (resource === 'communities') {
      if (slug === null) return respond(await loadCommunityDirectory(client, user))
      const linked = await loadLinkedCommunity(client, slug, user)
      return linked ? respond(linked) : respond({ error: 'Community unavailable' }, 404)
    }
    if (resource === 'records') return respond(await loadPublicLeaderboard(client, user))
    const [creators, blocked, showMlb] = await Promise.all([
      loadPublicCreators(client), user ? getBlockedEitherWayIds(client, user) : [], canViewMlb(client, user),
    ])
    const excluded = new Set(blocked)
    return respond({ creators: creators.filter(creator => !excluded.has(creator.id)).map(creator => ({
      ...creator, sports: creator.sports.filter(sport => showMlb || sport.toUpperCase() !== 'MLB'),
    })) })
  } catch {
    return respond({ error: 'Discovery is temporarily unavailable' }, 503)
  }
}
