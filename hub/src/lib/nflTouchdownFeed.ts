import 'server-only'

import { unstable_cache } from 'next/cache'
import { getGameSummary, getScoreboard, type ESPNSummary } from '@slipsurge/core/espn-api'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeNflPlayerName } from '@/lib/nflPlayerName'

export type NflTouchdownEvent = {
  id: string
  gameId: string
  espnGameId: string
  playerName: string
  playerId: string | null
  espnPlayerId: string | null
  headshot: string | null
  position: string | null
  team: string
  opponent: string
  teamLogo: string | null
  quarter: number
  clock: string
  kind: 'receiving' | 'rushing' | 'return' | 'defense' | 'other'
  yards: number | null
  passerName: string | null
  text: string
  awayScore: number
  homeScore: number
  isFirstTdOfGame: boolean
  playerTdNumber: number
  gameStatus: string
}

type RawScoringPlay = {
  id?: string
  type?: { text?: string }
  text?: string
  awayScore?: number
  homeScore?: number
  period?: { number?: number }
  clock?: { displayValue?: string }
  team?: { abbreviation?: string; logo?: string }
  scoringType?: { name?: string; displayName?: string }
}

type AthleteIdentity = {
  id: string | null
  name: string
  headshot: string | null
  position: string | null
}

const TEAM_ALIASES: Record<string, string> = { LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' }
const canonicalTeam = (value: string) => TEAM_ALIASES[value.toUpperCase()] ?? value.toUpperCase()

function scorerFromText(text: string) {
  return text.match(/^(.+?)\s+-?\d+\s+Yd\b/i)?.[1]?.trim()
    ?? text.match(/^(.+?)\s+(?:Pass|Rush|Reception|Return)\b/i)?.[1]?.trim()
    ?? ''
}

function passerFromText(text: string) {
  return text.match(/\bpass from (.+?)(?:\s*\(|$)/i)?.[1]?.trim() ?? null
}

function yardsFromText(text: string) {
  const raw = text.match(/\b(-?\d+)\s+Yd\b/i)?.[1]
  if (raw == null) return null
  const yards = Number(raw)
  return Number.isFinite(yards) ? yards : null
}

function touchdownKind(type: string, text: string): NflTouchdownEvent['kind'] {
  const value = `${type} ${text}`.toLowerCase()
  if (value.includes('passing touchdown') || value.includes('pass from')) return 'receiving'
  if (value.includes('rushing touchdown') || /\byd rush\b/.test(value)) return 'rushing'
  if (value.includes('return')) return value.includes('interception') || value.includes('fumble') ? 'defense' : 'return'
  return 'other'
}

function athleteIndex(summary: ESPNSummary) {
  const result = new Map<string, AthleteIdentity>()
  for (const team of summary.boxscore?.players ?? []) {
    for (const group of team.statistics ?? []) {
      for (const row of group.athletes ?? []) {
        const athlete = row.athlete as typeof row.athlete & { id?: string }
        const name = athlete.displayName?.trim()
        if (!name) continue
        const identity = {
          id: athlete.id ?? null,
          name,
          headshot: athlete.headshot?.href ?? null,
          position: athlete.position?.abbreviation ?? null,
        }
        result.set(normalizeNflPlayerName(name), identity)
      }
    }
  }
  return result
}

async function loadNflTouchdowns(date: string): Promise<NflTouchdownEvent[]> {
  const games = await getScoreboard('nfl', date)
  const activeGames = games.filter(game => game.status.type.state === 'in' || game.status.type.state === 'post')
  if (!activeGames.length) return []

  const { data: schedule } = await createAdminClient().from('nfl_schedule')
    .select('game_id,away_team,home_team')
    .eq('gameday', date)
    .limit(24)
    .abortSignal(AbortSignal.timeout(10_000))
  const gameByMatchup = new Map((schedule ?? []).map(row => [
    `${canonicalTeam(row.away_team)}@${canonicalTeam(row.home_team)}`,
    row.game_id as string,
  ]))

  const summaries = await Promise.all(activeGames.map(async game => ({ game, summary: await getGameSummary('nfl', game.id) })))
  const provisional: Array<NflTouchdownEvent & { _espnPlayerId: string | null }> = []

  for (const { game, summary } of summaries) {
    if (!summary) continue
    const [awayRaw = '', homeRaw = ''] = game.shortName.split(/\s+@\s+/)
    const away = canonicalTeam(awayRaw)
    const home = canonicalTeam(homeRaw)
    const gameId = gameByMatchup.get(`${away}@${home}`) ?? game.id
    const identities = athleteIndex(summary)
    const plays = ((summary as ESPNSummary & { scoringPlays?: RawScoringPlay[] }).scoringPlays ?? [])
      .filter(play => /touchdown/i.test(`${play.scoringType?.name ?? ''} ${play.scoringType?.displayName ?? ''} ${play.type?.text ?? ''}`))
    const playerCounts = new Map<string, number>()

    plays.forEach((play, index) => {
      const text = play.text?.trim() ?? 'Touchdown'
      const playerName = scorerFromText(text) || play.team?.abbreviation || 'Team touchdown'
      const identity = identities.get(normalizeNflPlayerName(playerName))
      const team = canonicalTeam(play.team?.abbreviation ?? '')
      const countKey = `${team}:${normalizeNflPlayerName(playerName)}`
      const playerTdNumber = (playerCounts.get(countKey) ?? 0) + 1
      playerCounts.set(countKey, playerTdNumber)
      provisional.push({
        id: play.id ?? `${game.id}-${index}`,
        gameId,
        espnGameId: game.id,
        playerName,
        playerId: null,
        espnPlayerId: identity?.id ?? null,
        _espnPlayerId: identity?.id ?? null,
        headshot: identity?.headshot ?? null,
        position: identity?.position ?? null,
        team,
        opponent: team === away ? home : away,
        teamLogo: play.team?.logo ?? null,
        quarter: Number(play.period?.number ?? 0),
        clock: play.clock?.displayValue ?? '',
        kind: touchdownKind(play.type?.text ?? '', text),
        yards: yardsFromText(text),
        passerName: passerFromText(text),
        text,
        awayScore: Number(play.awayScore ?? 0),
        homeScore: Number(play.homeScore ?? 0),
        isFirstTdOfGame: index === 0,
        playerTdNumber,
        gameStatus: game.status.type.shortDetail || game.status.type.description,
      })
    })
  }

  const espnIds = Array.from(new Set(provisional.flatMap(event => event._espnPlayerId ? [Number(event._espnPlayerId)] : []).filter(Number.isFinite)))
  const playerByEspnId = new Map<number, { gsis_id: string; headshot: string | null; position: string | null }>()
  if (espnIds.length) {
    const { data } = await createAdminClient().from('nfl_players')
      .select('espn_id,gsis_id,headshot,position')
      .in('espn_id', espnIds)
      .abortSignal(AbortSignal.timeout(10_000))
    for (const player of data ?? []) if (player.espn_id != null) playerByEspnId.set(Number(player.espn_id), player)
  }

  return provisional.map(({ _espnPlayerId, ...event }) => {
    const player = _espnPlayerId ? playerByEspnId.get(Number(_espnPlayerId)) : null
    return {
      ...event,
      playerId: player?.gsis_id ?? null,
      headshot: player?.headshot ?? event.headshot,
      position: player?.position ?? event.position,
      yards: Number.isFinite(event.yards) ? event.yards : null,
    }
  })
}

export const getNflTouchdownFeed = unstable_cache(loadNflTouchdowns, ['nfl-live-touchdown-feed-v1'], {
  revalidate: 15,
  tags: ['sideline:nfl-live'],
})
