import { NextResponse } from 'next/server'
import { getGameStatus, getGameSummary, getScoreboard, type SportKey } from '@slipsurge/core/espn-api'
import { getBlockedEitherWayIds, isAccountId } from '@/lib/blocks'
import { POST_WITH_AUTHOR, type FeedPost } from '@/lib/feedQuery'
import { getNflGameCenter } from '@/lib/nflGameCenterServer'
import { nbaGameReference } from '@/lib/nbaGameReference'
import { isGuestVisible, mobilePost, nativeAnonymousClient } from '@/lib/nativeSocial'
import { attachUserReactions } from '@/lib/queries'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 45
const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const sports = ['nfl', 'nba', 'nhl', 'soccer'] as const
const emojis = new Set(['❤️','🔥','⚡','👏','😂','👀','🏆','👍'])

function scope(request: Request) {
  const query = new URL(request.url).searchParams
  const sport = sports.find(league => league === query.get('sport')), id = query.get('game') ?? '', date = query.get('date') ?? ''
  if (!sport || !(/^\d{1,14}$/.test(id) || sport === 'nfl' && /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(id)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return null
  return { sport, id, date, section: query.get('section') ?? 'overview' }
}

async function source(sport: SportKey, id: string, day: string) {
  const nfl = sport === 'nfl' ? await getNflGameCenter(id) : null
  if (nfl) return { game: nfl.game, summary: nfl.summary, quarters: nfl.quarters, updatedAt: nfl.updatedAt, complete: nfl.complete }
  if (!/^\d+$/.test(id)) return null
  const [summary, games] = await Promise.all([getGameSummary(sport, id), getScoreboard(sport, day)])
  const game = games.find(event => event.id === id)
  if (summary && summary.header?.id !== id) return null
  return game || summary ? { game, summary, quarters: [], updatedAt: null, complete: null } : null
}

export async function GET(request: Request) {
  const chosen = scope(request)
  if (!chosen || !['overview','plays','box','picks','room'].includes(chosen.section)) return respond({ error: 'Choose a valid game' }, 400)
  const { sport, id, date, section } = chosen
  try {
    const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (account?.error) return account.error
    const client = account?.supabase ?? nativeAnonymousClient(), viewer = account?.userId
    const found = await source(sport, id, date)
    if (!found) return respond({ error: 'Matchup unavailable' }, 404)
    const match = found.summary?.header?.competitions?.[0]
    const board = found.game?.competitions?.[0]
    const state = match?.status?.type?.state ?? (found.game ? getGameStatus(found.game).state : 'pre')
    const status = match?.status?.type?.shortDetail ?? (found.game ? getGameStatus(found.game).label : null)
    const base = { sport, id, state, status, venue: match?.venue?.fullName ?? board?.venue?.fullName ?? null,
      awayScore: state !== 'pre' ? match?.competitors?.find(team => team.homeAway === 'away')?.score ?? board?.competitors.find(team => team.homeAway === 'away')?.score ?? null : null,
      homeScore: state !== 'pre' ? match?.competitors?.find(team => team.homeAway === 'home')?.score ?? board?.competitors.find(team => team.homeAway === 'home')?.score ?? null : null }
    if (section === 'room') {
      const result = await client.from('game_room_messages').select('id,user_id,content,created_at,sender:users!game_room_messages_user_id_fkey(username,display_name,avatar_url,is_verified)')
        .eq('sport', sport).eq('game_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(120)
      if (result.error) throw Error('Game room unavailable')
      const blocked = new Set(viewer ? await getBlockedEitherWayIds(client, viewer) : [])
      return respond({ ...base, room: (result.data ?? []).filter(row => !blocked.has(row.user_id)).reverse() })
    }
    if (section === 'picks') {
      const reference = sport === 'nba' ? await nbaGameReference(found.summary, found.game ?? null).catch(() => null) : null
      const pickID = String(reference?.id ?? id)
      const result = await client.from('posts').select(POST_WITH_AUTHOR).in('post_type', ['pick','parlay']).ilike('sport', sport)
        .order('created_at', { ascending: false }).limit(300)
      if (result.error) throw Error('Community picks unavailable')
      const blocked = new Set(viewer ? await getBlockedEitherWayIds(client, viewer) : [])
      const candidates = ((result.data ?? []) as unknown as FeedPost[])
        .filter(post => !blocked.has(post.author_id) && (viewer || isGuestVisible(post)) && (String(post.game_pk) === pickID ||
          post.pick_data?.legs?.some(leg => String(leg.game_pk) === pickID)))
        .sort((a,b) => b.reaction_count - a.reaction_count).slice(0,20)
      const picks = await attachUserReactions(candidates, viewer, client, true)
      return respond({ ...base, picks: picks.map(mobilePost) })
    }
    const plays = found.summary?.plays ?? []
    if (section === 'plays' || section === 'overview') {
      const lineup = section === 'overview' ? plays.filter(play => play.scoringPlay).slice(-8) : plays.slice(-220)
      const ids = lineup.map(play => String(play.id))
      const reactions = ids.length ? await client.from('play_reactions').select('play_id,emoji,user_id').eq('game_id', id).in('play_id', ids) : { data: [], error: null }
      if (reactions.error) throw Error('Play reactions unavailable')
      const byPlay = Map.groupBy(reactions.data ?? [], reaction => String(reaction.play_id))
      return respond({ ...base, quarters: found.quarters, updatedAt: found.updatedAt, complete: found.complete,
        broadcasts: (match?.broadcasts ?? board?.broadcasts ?? []).flatMap(network => network.names ?? []),
        leaders: (found.summary?.leaders ?? []).slice(0, 2).flatMap(group => group.leaders.slice(0, 5).flatMap(category =>
          category.leaders.slice(0, 1).map(row => ({ team: group.team.abbreviation, label: category.displayName, value: row.displayValue,
            name: row.athlete.displayName, headshot: row.athlete.headshot?.href ?? null, logo: group.team.logo })))),
        plays: [...lineup].reverse().map(play => ({ id: String(play.id), title: play.type?.text ?? null, text: play.text ?? '',
          period: play.period?.displayValue ?? null, clock: play.clock?.displayValue ?? null, home: play.homeScore ?? null,
          away: play.awayScore ?? null, scoring: play.scoringPlay === true, teamId: play.team?.id ?? null,
          athletes: (play.athletes ?? []).slice(0, 4).map(player => ({ id: player.athlete.id, name: player.athlete.displayName, headshot: player.athlete.headshot?.href ?? null })),
          reactions: Object.fromEntries([...Map.groupBy(byPlay.get(String(play.id)) ?? [], item => item.emoji)].map(([emoji, rows]) =>
            [emoji, { count: rows.length, mine: rows.some(row => row.user_id === viewer) }])) })),
      })
    }
    const teams = found.summary?.boxscore?.teams ?? []
    const players = found.summary?.boxscore?.players ?? []
    return respond({ ...base, teamStats: teams.map(team => ({ team: team.team.abbreviation, logo: team.team.logo, stats: team.statistics })),
      groups: players.flatMap(team => team.statistics.map((set, index) => ({
        id: `${team.team.abbreviation}:${index}`, team: team.team.abbreviation, category: set.name ?? null,
        labels: set.labels ?? set.keys ?? [], players: (set.athletes ?? []).map((row, rowIndex) => ({
          id: `${team.team.abbreviation}:${index}:${rowIndex}`, name: row.athlete.displayName, headshot: row.athlete.headshot?.href ?? null,
          position: row.athlete.position?.abbreviation ?? null, values: row.stats ?? [],
        })),
      }))),
    })
  } catch {
    return respond({ error: 'Game details are temporarily unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  const chosen = scope(request)
  if (!chosen) return respond({ error: 'Choose a valid game' }, 400)
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { sport, id, date } = chosen, { supabase, userId } = account
  try {
    const raw = await request.text()
    if (raw.length > 5000) return respond({ error: 'Invalid game action' }, 400)
    const action = JSON.parse(raw)
    if (!action || typeof action !== 'object' || Array.isArray(action)) return respond({ error: 'Invalid game action' }, 400)
    const game = await source(sport, id, date)
    if (!game) return respond({ error: 'Game unavailable' }, 404)
    if (action.kind === 'post' && typeof action.id === 'string' && isAccountId(action.id) && typeof action.text === 'string') {
      const content = action.text.trim()
      if (!content || content.length > 800) return respond({ error: 'Check your message' }, 400)
      const identity = { id: action.id, user_id: userId, game_id: id, sport, content }
      const result = await supabase.from('game_room_messages').insert(identity)
      if (result.error?.code === '23505') {
        const check = await supabase.from('game_room_messages').select('id').match(identity).maybeSingle()
        return check.data ? respond({ ok: true }) : respond({ error: 'Message could not be confirmed' }, 409)
      }
      return result.error ? respond({ error: 'Message could not be sent' }, 403) : respond({ ok: true })
    }
    if (action.kind === 'react' && typeof action.play === 'string' && emojis.has(action.emoji) && typeof action.enabled === 'boolean') {
      if (!game.summary?.plays?.some(play => String(play.id) === action.play)) return respond({ error: 'Play unavailable' }, 404)
      const identity = { game_id: id, play_id: action.play, emoji: action.emoji, user_id: userId }
      const result = await (action.enabled ? supabase.from('play_reactions').insert(identity) : supabase.from('play_reactions').delete().match(identity))
      return !result.error || result.error.code === '23505' ? respond({ ok: true }) : respond({ error: 'Reaction could not be saved' }, 503)
    }
    return respond({ error: 'Invalid game action' }, 400)
  } catch (error) {
    return error instanceof SyntaxError ? respond({ error: 'Invalid game action' }, 400) : respond({ error: 'Game action is temporarily unavailable' }, 503)
  }
}
