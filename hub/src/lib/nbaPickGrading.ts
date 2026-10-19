import { gradeNbaValue, nbaAppeared, nbaValue, type PaintStat } from './nbaPaint'
export type NbaPendingPick = { id: string; post_id: string | null; game_pk: string; player_id: string; player_name: string | null; pick_type: string; market_side: 'over' | 'under' | 'milestone' | null; numeric_line: number | null }
export function gradeNbaPick(pick: NbaPendingPick, stats: PaintStat[]) {
  if (!/^bdl:\d+$/.test(pick.player_id) || pick.numeric_line == null || !pick.market_side || !['over', 'under', 'milestone'].includes(pick.market_side)) return null
  const row = stats.find(s => s.player.id === Number(pick.player_id.slice(4)) && String(s.game.id) === pick.game_pk)
  // Unknown identity, a partial game, DNP, or missing stats never becomes a loss.
  if (!row || !(row.game.status_state === 'final' || row.game.status === 'Final') || !nbaAppeared(row)) return null
  return gradeNbaValue(nbaValue(row, pick.pick_type), Number(pick.numeric_line), pick.market_side)
}
