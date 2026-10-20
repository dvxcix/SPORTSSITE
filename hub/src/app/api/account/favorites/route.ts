import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import { FAVORITE_PLAYERS_PER_SPORT, favoritePlayerKey, favoritePlayerSport, favoriteUpdates, normalizeFavoritePlayers, normalizeFavoriteTeams, resolveFavoriteTeam } from '@/lib/sportFavorites'
import { safeApiError } from '@/lib/safeApiError'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store, max-age=0' }

async function account() {
  const { userId } = await resolveAuthedClient()
  if (!userId) return { error: NextResponse.json({ error: 'Sign in to save favorites.' }, { status: 401, headers }) }
  const admin = createAdminClient()
  const { data: profile, error } = await admin.from('users').select('id,account_type,tier,discord_advanced_claimed,admin_granted_tier,favorite_teams,favorite_players,favorite_sports').eq('id', userId).maybeSingle()
  if (error) return { error: safeApiError('favorites-account', error, 'Favorites could not be loaded.') }
  if (!profile) return { error: NextResponse.json({ error: 'Your profile is not ready.' }, { status: 409, headers }) }
  return { admin, profile, allowNba: true }
}

export async function GET() {
  const auth = await account()
  if (auth.error) return auth.error
  try {
    return NextResponse.json({ catalog: await getFavoriteCatalog(auth.allowNba), teams: normalizeFavoriteTeams(auth.profile.favorite_teams, auth.allowNba), players: normalizeFavoritePlayers(auth.profile.favorite_players, auth.allowNba), sports: auth.profile.favorite_sports ?? [] }, { headers })
  } catch (error) { return safeApiError('favorites-catalog', error, 'Teams could not be loaded. Please try again.') }
}

export async function PATCH(request: Request) {
  const auth = await account()
  if (auth.error) return auth.error
  let body: Record<string, unknown>
  try { body = await request.json(); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid') } catch { return NextResponse.json({ error: 'Invalid favorites.' }, { status: 400, headers }) }
  let teams = body.teams, players = body.players
  if (teams !== undefined && !Array.isArray(teams) || players !== undefined && !Array.isArray(players)) return NextResponse.json({ error: 'Invalid favorites.' }, { status: 400, headers })
  if (body.action === 'add' || body.action === 'remove') {
    const currentTeams = normalizeFavoriteTeams(auth.profile.favorite_teams)
    const currentPlayers = normalizeFavoritePlayers(auth.profile.favorite_players)
    if (body.team !== undefined) {
      const team = normalizeFavoriteTeams([body.team])[0]
      if (!team || team.startsWith('NBA:') && !auth.allowNba) return NextResponse.json({ error: 'That team is unavailable.' }, { status: 403, headers })
      const catalog = await getFavoriteCatalog(auth.allowNba).catch(() => null)
      if (!catalog) return NextResponse.json({ error: 'Teams could not be loaded.' }, { status: 503, headers })
      if (!catalog.some(item => item.key === team)) return NextResponse.json({ error: 'Unknown team.' }, { status: 400, headers })
      const matches = (key: string) => resolveFavoriteTeam(key, catalog, auth.profile.favorite_sports ?? [])?.key === team
      teams = body.action === 'add' ? currentTeams.some(matches) ? currentTeams : [...currentTeams, team] : currentTeams.filter(key => !matches(key))
    } else {
      const player = normalizeFavoritePlayers([body.player])[0]
      if (!player || favoritePlayerSport(player) === 'nba' && !auth.allowNba) return NextResponse.json({ error: 'That player is unavailable.' }, { status: 403, headers })
      const key = favoritePlayerKey(player)
      const sport = favoritePlayerSport(player), count = currentPlayers.filter(item => favoritePlayerSport(item) === sport).length
      if (body.action === 'add' && count >= FAVORITE_PLAYERS_PER_SPORT && !currentPlayers.some(item => favoritePlayerKey(item) === key)) return NextResponse.json({ error: `Choose up to ${FAVORITE_PLAYERS_PER_SPORT} favorite ${sport.toUpperCase()} players. Edit your favorites in Settings.` }, { status: 400, headers })
      players = body.action === 'add' ? [...currentPlayers, player] : currentPlayers.filter(item => favoritePlayerKey(item) !== key)
    }
  }
  const update = favoriteUpdates({ teams, players }, auth.profile, auth.allowNba)
  if (!Object.keys(update).length) return NextResponse.json({ error: 'No favorites supplied.' }, { status: 400, headers })
  const { error } = await auth.admin.from('users').update(update).eq('id', auth.profile.id)
  if (error) return safeApiError('favorites-save', error, 'Favorites could not be saved.')
  return NextResponse.json({ ok: true, teams: normalizeFavoriteTeams(update.favorite_teams ?? auth.profile.favorite_teams, auth.allowNba), players: normalizeFavoritePlayers(update.favorite_players ?? auth.profile.favorite_players, auth.allowNba) }, { headers })
}
