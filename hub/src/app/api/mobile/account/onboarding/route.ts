import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownOnboardingComplete } from '@/lib/supabase/ownOnboarding'
import { saveAccountOnboarding } from '@/lib/accountOnboardingServer'
import { bootstrapAccount } from '@/lib/accountBootstrap'
import { favoritePlayerSport, normalizeFavoritePlayers, normalizeFavoriteTeams, resolveFavoriteTeam } from '@/lib/sportFavorites'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import { canViewMlb } from '@/lib/mlbViewerAccess'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request, { allowSetup: true })
  if (account.error) return account.error
  try {
    const { supabase, userId } = account
    const admin = createAdminClient()
    const allowMlb = await canViewMlb(supabase, userId)
    const [profile, catalog] = await Promise.all([
      admin.from('users').select('username,display_name,bio,avatar_url,banner_url,favorite_sports,favorite_teams,favorite_players,is_private,hide_win_rate,notification_settings,interest_settings,onboarding_completed_at')
        .eq('id', userId).maybeSingle(),
      getFavoriteCatalog(true),
    ])
    if (profile.error) throw new Error('Setup unavailable')
    const value = profile.data
    const sports: string[] = Array.isArray(value?.favorite_sports) ? value.favorite_sports : []
    const allowed = (sport: string) => allowMlb || sport.toUpperCase() !== 'MLB'
    const teams = normalizeFavoriteTeams(value?.favorite_teams).flatMap(key => {
      const team = resolveFavoriteTeam(key, catalog, sports)
      return team && allowed(team.sport) ? [team.key] : []
    })
    return respond({
      complete: Boolean(value?.onboarding_completed_at), allowMlb, username: value?.username ?? null,
      displayName: value?.display_name ?? '', bio: value?.bio ?? '',
      avatarUrl: value?.avatar_url ?? null, bannerUrl: value?.banner_url ?? null,
      sports: sports.filter(allowed), teams,
      favoritePlayers: normalizeFavoritePlayers(value?.favorite_players).filter(player => allowed(favoritePlayerSport(player))),
      catalog: catalog.filter(team => allowed(team.sport)), isPrivate: value?.is_private === true, hideWinRate: value?.hide_win_rate === true,
      alerts: value?.notification_settings ?? {}, contentMix: value?.interest_settings?.content_mix ?? [],
      marketFocus: value?.interest_settings?.market_focus ?? [],
    })
  } catch {
    return respond({ error: 'Account setup could not refresh' }, 503)
  }
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request, { allowSetup: true })
  if (account.error) return account.error
  try {
    const { supabase, userId } = account
    if (await ownOnboardingComplete(supabase)) return respond({ ok: true })
    if (Number(request.headers.get('content-length')) > 32_768) return respond({ error: 'Setup is too large' }, 413)
    const raw = await request.text()
    if (raw.length > 32_768) return respond({ error: 'Setup is too large' }, 413)
    const { data, error } = await supabase.auth.getUser(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''))
    if (error || data.user?.id !== userId) return respond({ error: 'Sign in again to finish setup' }, 401)
    const bootstrap = await bootstrapAccount(data.user)
    if (!bootstrap.ok) return bootstrap
    return saveAccountOnboarding(new Request(request.url, { method: 'POST', body: raw }), userId)
  } catch {
    return respond({ error: 'Account setup could not be confirmed' }, 503)
  }
}
