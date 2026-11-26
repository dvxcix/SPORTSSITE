import 'server-only'
import { getGameSummary, getScoreboard } from '@slipsurge/core/espn-api'
import { getNflGameCenter } from './nflGameCenterServer'
import { loadNativeMlbGame } from './nativeMlbGameCenter'
import type { GameAlertScope } from './nativeGameAlerts'

export function gameAlertsEnabled() {
  return process.env.SLIPSURGE_NATIVE_GAME_ALERTS === '1'
}

export async function gameAlertSource(scope: GameAlertScope, validateDate = false) {
  if (scope.sport === 'mlb') return (await loadNativeMlbGame(scope.gameId, scope.date))?.summary ?? null
  if (scope.sport === 'nfl' && scope.gameId.includes('_')) {
    const result = await getNflGameCenter(scope.gameId)
    return result?.date === scope.date ? result.summary : null
  }
  if (validateDate && !(await getScoreboard(scope.sport, scope.date, 'live')).some(game => game.id === scope.gameId)) return null
  return getGameSummary(scope.sport, scope.gameId, 'live')
}
