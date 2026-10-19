import { nbaName } from './nbaPaint'
export type NbaPlay = { game_id: number; order: number; type: string; text: string; period: number; clock: string; scoring_play: boolean; shooting_play: boolean; score_value: number | null; team: { id: number } | null; coordinate_x: number | null; coordinate_y: number | null; participants: number[] }
export type NbaShot = { gameId: number; order: number; playerId: number; teamId: number; period: number; clock: string; text: string; made: boolean; points: 2 | 3; x: number | null; y: number | null; halfCourt: boolean }
/** Provider coordinates are feet relative to the attacking rim: (25,0).
 * Both teams are already normalized. Never flip by home/away or period.
 * Invalid/sentinel coordinates remain an attempt with an unknown location.
 */
export function nbaShots(plays: NbaPlay[], game: number, player: { id: number; first_name: string; last_name: string }) {
  const name = nbaName(`${player.first_name} ${player.last_name}`)
  return [...new Map(plays.map(play => [play.order, play])).values()].flatMap(play => {
    if (play.game_id !== game || !play.shooting_play || !play.team?.id || /free throw/i.test(`${play.type} ${play.text}`) || play.participants?.[0] !== player.id || !nbaName(play.text).startsWith(name) || !/\b(makes|misses)\b/i.test(play.text)) return []
    const x = play.coordinate_x, y = play.coordinate_y
    const located = typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 50 && typeof y === 'number' && Number.isFinite(y) && y >= -5.25 && y <= 88.75
    return [{ gameId: game, order: play.order, playerId: player.id, teamId: play.team.id, period: play.period, clock: play.clock, text: play.text, made: play.scoring_play === true, points: play.score_value === 3 || /three point|three pointer|3-point/i.test(play.text) ? 3 : 2, x: located ? x : null, y: located ? y : null, halfCourt: located && y! <= 41.75 } satisfies NbaShot]
  }).sort((a, b) => a.order - b.order)
}
