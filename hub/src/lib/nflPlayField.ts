import type { ESPNPlay, NflPlayField } from '@slipsurge/core/espn-api'

const eligible = new Set(['rush', 'pass-reception', 'pass-incompletion', 'sack', 'rushing-touchdown', 'passing-touchdown'])

function integerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/** Field coordinates use the same offense's distance from the goal at both spots. */
export function nflPlayField(input: {
  kind?: string; text?: string; start: unknown; end: unknown; yards: unknown; down: unknown; distance: unknown
}): NflPlayField | undefined {
  const kind = input.kind?.trim().toLowerCase().replace(/\s+/g, '-')
  if (!kind || !eligible.has(kind) || !input.text || /\b(no play|nullified|overturned|fumbles?|intercepted|lateral(?:s|ed)?)\b/i.test(input.text)) return
  const { start, end, yards, down, distance } = input
  if (!integerIn(start, 1, 99) || !integerIn(end, 0, 100) || !integerIn(yards, -99, 99) || start - end !== yards) return
  if (kind.endsWith('-touchdown') ? end !== 0 : end === 0 || end === 100) return
  return { startToGoal: start, endToGoal: end,
    ...(integerIn(down, 1, 4) ? { down } : {}), ...(integerIn(distance, 1, start) ? { distance } : {}) }
}

export function espnNflPlayField(play: ESPNPlay): NflPlayField | undefined {
  if (play.nflField) return play.nflField
  const { start, end } = play
  if (!start?.team?.id || start.team.id !== end?.team?.id) return
  return nflPlayField({ kind: play.type?.text, text: play.text, start: start.yardsToEndzone,
    end: end.yardsToEndzone, yards: play.statYardage, down: start.down, distance: start.distance })
}
