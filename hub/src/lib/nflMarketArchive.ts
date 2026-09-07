import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'
export { attachNflTdBaselines, type NflTdBaselineRow } from '@/lib/nflOddsLogic'

export type NflMarketScheduleGame = {
  game_id: string
  season: number
  week: number
  game_type: string
  gameday: string
  away_team: string
  home_team: string
}

export function flattenNflMarketBoard(game: NflMarketScheduleGame, board: SidelineOddsBoard, source = 'live') {
  if (!board.bdlGameId) return []
  return board.players.flatMap(player => player.markets.flatMap(market => market.offers.map(offer => ({
    slate_date: game.gameday,
    game_id: game.game_id,
    bdl_game_id: board.bdlGameId,
    season: game.season,
    week: game.week,
    game_type: game.game_type,
    away_abbr: game.away_team,
    home_abbr: game.home_team,
    player_id: player.id,
    player_name: player.name,
    team_abbr: player.team || null,
    position: player.position || null,
    vendor: offer.vendor,
    prop_type: market.propType,
    market_key: market.key,
    line_value: offer.line,
    market_type: offer.type,
    opening_line: offer.openingLine,
    opening_odds: offer.opening?.odds ?? null,
    opening_over_odds: offer.opening?.over ?? null,
    opening_under_odds: offer.opening?.under ?? null,
    current_odds: offer.current.odds ?? null,
    current_over_odds: offer.current.over ?? null,
    current_under_odds: offer.current.under ?? null,
    source,
    captured_at: board.capturedAt ?? new Date().toISOString(),
  }))))
}

export async function ingestNflMarketBoard(
  admin: SupabaseClient,
  game: NflMarketScheduleGame,
  board: SidelineOddsBoard,
  source = 'live',
) {
  const rows = flattenNflMarketBoard(game, board, source)
  if (!rows.length) return 0
  const { data, error } = await admin.rpc('ingest_nfl_market_daily', { p_rows: rows })
  if (error) throw new Error(`NFL daily market archive failed: ${error.message}`)
  return Number(data ?? rows.length)
}

export async function refreshNflTdBaselines(admin: SupabaseClient, dates: string[]) {
  if (!dates.length) return 0
  const { data, error } = await admin.rpc('refresh_nfl_td_baselines', { p_dates: dates })
  if (error) throw new Error(`NFL touchdown baseline refresh failed: ${error.message}`)
  return Number(data ?? 0)
}
