import { NextResponse } from 'next/server'
import { loadCommunityDirectory } from '@/lib/communityDirectoryServer'
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
  const resource = new URL(request.url).searchParams.get('resource')
  if (resource !== 'communities' && resource !== 'creators' && resource !== 'records') {
    return respond({ error: 'Invalid discovery section' }, 400)
  }
  try {
    const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (account?.error) return account.error
    const client = account?.supabase ?? nativeAnonymousClient()
    const user = account?.userId
    if (resource === 'communities') return respond(await loadCommunityDirectory(client, user))
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
