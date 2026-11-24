import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { favoritePlayerKey, favoritePlayerSport, favoriteUpdates, normalizeFavoritePlayers, normalizeFavoriteTeams, resolveFavoriteTeam } from '@/lib/sportFavorites'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { safeApiError } from '@/lib/safeApiError'
import { onboardingBaseline } from '@/lib/onboardingBaseline'

export const dynamic = 'force-dynamic'

const ALLOWED_SPORTS = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Tennis', 'Golf'])
const ALLOWED_CONTENT = new Set(['research', 'picks', 'live-games', 'community', 'creators', 'results'])
const ALLOWED_MARKETS = new Set(['moneyline', 'player-props', 'milestones', 'first-score', 'live', 'matrices'])
const ALERT_KEYS = ['lineup_confirmed', 'new_pick', 'pick_result', 'dm'] as const

function boundedStrings(value: unknown, allowed: Set<string> | null, maxItems: number, maxLength = 40) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length <= maxLength && (!allowed || allowed.has(item))))]
    .slice(0, maxItems)
}

function safeImageUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.href.length <= 2048 ? url.href : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Your session expired. Sign in again to finish setup.', code: 'SESSION_EXPIRED' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid body')
  } catch {
    return NextResponse.json({ error: 'Account setup details were invalid.' }, { status: 400 })
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : ''
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 280) : ''
  const sports = boundedStrings(body.sports, ALLOWED_SPORTS, 8)
  const contentMix = boundedStrings(body.contentMix, ALLOWED_CONTENT, 6)
  const marketFocus = boundedStrings(body.marketFocus, ALLOWED_MARKETS, 6)
  const requestedAlerts = body.alerts && typeof body.alerts === 'object' ? body.alerts as Record<string, unknown> : {}

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, account_type, tier, discord_advanced_claimed, admin_granted_tier, favorite_teams, favorite_players, favorite_sports, notification_settings, interest_settings, display_name, bio, avatar_url, banner_url, is_private, hide_win_rate, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return safeApiError('account-onboarding-profile', profileError, 'We could not load your account setup.')
  if (!profile) {
    return NextResponse.json({ error: 'Your account profile is not ready yet. Refresh and try again.', code: 'PROFILE_NOT_READY' }, { status: 409 })
  }
  if (typeof body.initialBaseline !== 'string' || !/^[a-f0-9]{64}$/.test(body.initialBaseline)
    || body.initialBaseline !== onboardingBaseline(user.id, profile)) {
    return NextResponse.json({ error: 'Your settings changed. Refresh setup before saving.', code: 'ONBOARDING_STALE' }, { status: 409, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  }
  // Do not coerce legacy arrays or scalar JSON into an object. A user must
  // not lose unrecognized saved state merely by finishing onboarding.
  const isObject = (value: unknown) => value === null || (!!value && typeof value === 'object' && !Array.isArray(value))
  if (!isObject(profile.notification_settings) || !isObject(profile.interest_settings)) {
    return NextResponse.json({ error: 'Your saved preferences need attention before setup can continue.' }, { status: 409 })
  }

  if (MLB_HIBERNATING && profile.account_type !== 'admin') {
    // Hidden MLB favorites remain stored unchanged when a member updates other
    // sports. Resolve legacy bare team abbreviations using the same catalog and
    // prior sport preferences as the favorites editor; never infer from names.
    const catalog = await getFavoriteCatalog(true).catch(() => null)
    if (!catalog) return NextResponse.json({ error: 'Teams could not be loaded.' }, { status: 503 })
    const oldSports = boundedStrings(profile.favorite_sports, ALLOWED_SPORTS, 8)
    const oldTeams = normalizeFavoriteTeams(profile.favorite_teams)
    const oldPlayers = normalizeFavoritePlayers(profile.favorite_players)
    const teamIsMlb = (key: string) => resolveFavoriteTeam(key, catalog, oldSports)?.sport === 'mlb' || key.startsWith('MLB:')
    const hiddenTeams = oldTeams.filter(teamIsMlb)
    const hiddenPlayers = oldPlayers.filter(player => favoritePlayerSport(player) === 'mlb')
    const requestedTeams = normalizeFavoriteTeams(body.teams ?? [])
    const requestedPlayers = normalizeFavoritePlayers(body.favoritePlayers ?? [])
    if (sports.includes('MLB') && !oldSports.includes('MLB')
      || requestedTeams.some(key => teamIsMlb(key) && !hiddenTeams.includes(key))
      || requestedPlayers.some(player => favoritePlayerSport(player) === 'mlb' && !hiddenPlayers.some(previous => favoritePlayerKey(previous) === favoritePlayerKey(player)))) {
      return NextResponse.json({ error: 'That sport is unavailable.' }, { status: 403 })
    }
    body.teams = [...requestedTeams.filter(key => !teamIsMlb(key)), ...hiddenTeams]
    body.favoritePlayers = [...hiddenPlayers, ...requestedPlayers.filter(player => favoritePlayerSport(player) !== 'mlb')]
    if (oldSports.includes('MLB') && !sports.includes('MLB')) sports.push('MLB')
  }

  const alerts = { ...((profile.notification_settings as Record<string, boolean> | null) ?? {}) }
  for (const key of ALERT_KEYS) {
    if (typeof requestedAlerts[key] === 'boolean') alerts[key] = requestedAlerts[key] as boolean
  }

  const interests = (profile.interest_settings as Record<string, unknown> | null) ?? {}
  const changes = {
    display_name: displayName || undefined,
    bio: bio || undefined,
    avatar_url: safeImageUrl(body.avatarUrl) || undefined,
    banner_url: safeImageUrl(body.bannerUrl) || undefined,
    ...favoriteUpdates({ teams: body.teams ?? [], players: body.favoritePlayers ?? [] }, profile, true),
    favorite_sports: sports,
    interest_settings: { ...interests, content_mix: contentMix, market_focus: marketFocus, discovery_mode: interests.discovery_mode ?? 'balanced' },
    is_private: body.isPrivate === true,
    hide_win_rate: body.hideWinRate === true,
    notification_settings: alerts,
    onboarding_completed_at: new Date().toISOString(),
  }
  const expected = {
    favorite_teams: profile.favorite_teams ?? null,
    favorite_players: profile.favorite_players ?? null,
    favorite_sports: profile.favorite_sports ?? null,
    interest_settings: profile.interest_settings ?? null,
    notification_settings: profile.notification_settings ?? null,
    display_name: profile.display_name ?? null,
    bio: profile.bio ?? null,
    avatar_url: profile.avatar_url ?? null,
    banner_url: profile.banner_url ?? null,
    is_private: profile.is_private ?? null,
    hide_win_rate: profile.hide_win_rate ?? null,
    onboarding_completed_at: profile.onboarding_completed_at ?? null,
  }
  // One guarded write compares the exact source values and writes the whole
  // onboarding result atomically. Never retry an uncertain database write.
  const { data: saved, error: updateError } = await admin.rpc('save_account_onboarding', { p_user_id: user.id, p_expected: expected, p_changes: changes })

  if (updateError) return safeApiError('account-onboarding-save', updateError, 'We could not save your profile.')
  if (saved !== true) return NextResponse.json({ error: 'Preferences changed elsewhere. Refresh and try again.' }, { status: 409, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
