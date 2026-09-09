import 'server-only'
import { normalizeNflPlayerName as canonicalName } from '@/lib/nflPlayerName'

import { createAdminClient } from '@/lib/supabase/admin'
import type { NflOddsPlayer, SidelineOddsBoard } from '@/lib/nflOddsTypes'
import type { SidelineGame } from './types'

type PlayerDirectoryRow = {
  gsis_id: string
  display_name: string | null
  short_name: string | null
  football_name: string | null
  position: string | null
  latest_team: string | null
  headshot: string | null
  jersey_number: number | null
  rookie_season: number | null
  last_season: number | null
  status: string | null
  espn_id: string | number | null
}

const TEAM_ALIASES: Record<string, string> = { LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' }

function canonicalTeam(value: string | null | undefined) {
  const upper = String(value ?? '').toUpperCase()
  return TEAM_ALIASES[upper] ?? upper
}

function namesFor(row: PlayerDirectoryRow) {
  return [row.display_name, row.short_name, row.football_name].map(canonicalName).filter(Boolean)
}

function positionGroup(value: string | null | undefined) {
  const position = String(value ?? '').toUpperCase()
  if (['HB', 'FB'].includes(position)) return 'RB'
  if (['NT', 'DT', 'DE'].includes(position)) return 'DL'
  if (['CB', 'DB', 'FS', 'SS'].includes(position)) return 'DB'
  if (['OLB', 'ILB', 'MLB'].includes(position)) return 'LB'
  return position
}

function candidateScore(candidate: PlayerDirectoryRow, player: NflOddsPlayer, game: SidelineGame) {
  const name = canonicalName(player.name)
  const candidateNames = namesFor(candidate)
  const exactName = candidateNames.includes(name)
  const nameContainment = candidateNames.some(value => value.includes(name) || name.includes(value))
  const teamMatch = canonicalTeam(candidate.latest_team) === canonicalTeam(player.team)
  const positionMatch = positionGroup(candidate.position) === positionGroup(player.position)
  const activeSeason = (candidate.last_season ?? 0) >= game.season - 1
  const canonicalGsis = candidate.gsis_id.startsWith('00-')
  return (exactName ? 100 : nameContainment ? 55 : 0)
    + (teamMatch ? 22 : 0)
    + (positionMatch ? 12 : 0)
    + (activeSeason ? 7 : 0)
    + (canonicalGsis ? 2 : 0)
}

function espnHeadshot(espnId: PlayerDirectoryRow['espn_id']) {
  return espnId == null || String(espnId).trim() === ''
    ? null
    : `https://a.espncdn.com/i/headshots/nfl/players/full/${String(espnId).trim()}.png`
}

async function loadDirectory(players: NflOddsPlayer[], game: SidelineGame) {
  const admin = createAdminClient()
  const names = Array.from(new Set(players.map(player => player.name).filter(Boolean)))
  const teams = Array.from(new Set([game.away.abbr, game.home.abbr].map(canonicalTeam)))
  const select = 'gsis_id,display_name,short_name,football_name,position,latest_team,headshot,jersey_number,rookie_season,last_season,status,espn_id'
  const chunks = <T,>(values: T[], size = 80) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))
  const queries = [
    ...chunks(names).flatMap(chunk => [
      admin.from('nfl_players').select(select).in('display_name', chunk),
      admin.from('nfl_players').select(select).in('short_name', chunk),
      admin.from('nfl_players').select(select).in('football_name', chunk),
    ]),
    admin.from('nfl_players').select(select).in('latest_team', teams).gte('last_season', game.season - 1).limit(500),
  ]
  const results = await Promise.all(queries.map(query => query.abortSignal(AbortSignal.timeout(10000))))
  const rows = new Map<string, PlayerDirectoryRow>()
  for (const result of results) {
    if (result.error) {
      console.warn('[the-sideline] player directory lookup failed', result.error.message)
      continue
    }
    for (const row of result.data ?? []) rows.set(String(row.gsis_id), row as PlayerDirectoryRow)
  }
  return Array.from(rows.values())
}

export async function enrichSidelineOddsBoards(game: SidelineGame, boards: SidelineOddsBoard[]) {
  const players = boards.flatMap(board => board.players)
  if (!players.length) return boards
  const directory = await loadDirectory(players, game)
  const resolved = new Map<string, PlayerDirectoryRow | null>()

  const resolve = (player: NflOddsPlayer) => {
    const key = `${player.id}:${canonicalTeam(player.team)}:${canonicalName(player.name)}`
    if (resolved.has(key)) return resolved.get(key) ?? null
    const ranked = directory
      .map(candidate => ({ candidate, score: candidateScore(candidate, player, game) }))
      .filter(entry => entry.score >= 55)
      .sort((a, b) => b.score - a.score || (b.candidate.last_season ?? 0) - (a.candidate.last_season ?? 0))
    const winner = ranked[0]?.candidate ?? null
    resolved.set(key, winner)
    return winner
  }

  return boards.map(board => ({
    ...board,
    players: board.players.map(player => {
      const identity = resolve(player)
      if (!identity) return player
      const fallback = espnHeadshot(identity.espn_id)
      const headshotFallbacks = Array.from(new Set([identity.headshot, fallback].filter((value): value is string => Boolean(value))))
      return {
        ...player,
        gsisId: identity.gsis_id,
        headshot: headshotFallbacks[0] ?? null,
        headshotFallbacks,
        jersey: identity.jersey_number,
        rookieSeason: identity.rookie_season,
        lastSeason: identity.last_season,
        latestTeam: identity.latest_team,
        rosterStatus: identity.status,
        position: player.position || identity.position || '',
      }
    }),
  }))
}
