import type { SidelineGame } from './types'

const EASTERN = 'America/New_York'

function partsAt(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

/** Converts the schedule's Eastern local date/time to an absolute kickoff instant. */
export function nflKickoffAt(game: Pick<SidelineGame, 'gameday' | 'gametime'>): Date | null {
  if (!game.gametime || !/^\d{1,2}:\d{2}$/.test(game.gametime)) return null
  const [year, month, day] = game.gameday.split('-').map(Number)
  const [hour, minute] = game.gametime.split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null

  const desired = Date.UTC(year, month - 1, day, hour, minute)
  let candidate = new Date(desired)
  // Two passes resolve both EST/EDT without hard-coding daylight-saving dates.
  for (let pass = 0; pass < 2; pass += 1) {
    const rendered = partsAt(candidate)
    const actual = Date.UTC(
      Number(rendered.year), Number(rendered.month) - 1, Number(rendered.day),
      Number(rendered.hour), Number(rendered.minute), Number(rendered.second),
    )
    candidate = new Date(candidate.getTime() + desired - actual)
  }
  return Number.isFinite(candidate.getTime()) ? candidate : null
}

export function sidelinePregameCutoff(game: Pick<SidelineGame, 'gameday' | 'gametime'>, now = new Date()) {
  const kickoff = nflKickoffAt(game)
  return kickoff && kickoff.getTime() <= now.getTime() ? kickoff.toISOString() : null
}
