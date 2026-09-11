const MINUTE = 60_000
const HOUR = 60 * MINUTE

export type DatedCapture = {
  gameDate: string
  gameTime?: string | null
  capturedAt?: number | null
}

function easternDate(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function calendarDaysUntil(gameDate: string, now: Date): number {
  const today = easternDate(now)
  return Math.round(
    (Date.parse(`${gameDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / (24 * HOUR),
  )
}

// Pregame boards matter most on game day. Future boards change much less often,
// so repeatedly opening a paid remote browser for every listed game adds cost
// without adding useful snapshots.
export function browserbaseRefreshAfterMs(gameDate: string, now = new Date()): number {
  const daysUntil = calendarDaysUntil(gameDate, now)
  if (daysUntil <= 0) return 30 * MINUTE
  if (daysUntil === 1) return 3 * HOUR
  if (daysUntil === 2) return 6 * HOUR
  return 12 * HOUR
}

export function easternKickoff(gameDate: string, gameTime: string | null | undefined): Date | null {
  if (!gameTime || !/^\d{1,2}:\d{2}$/.test(gameTime)) return null
  const [year, month, day] = gameDate.split('-').map(Number)
  const [hour, minute] = gameTime.split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null
  const desired = Date.UTC(year, month - 1, day, hour, minute)
  let candidate = new Date(desired)
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(candidate).map(part => [part.type, part.value]))
    const actual = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
    candidate = new Date(candidate.getTime() + desired - actual)
  }
  return Number.isFinite(candidate.getTime()) ? candidate : null
}

export function nflBrowserbaseRefreshAfterMs(gameDate: string, gameTime: string | null | undefined, now = new Date()): number {
  const daysUntil = calendarDaysUntil(gameDate, now)
  if (daysUntil > 0) return browserbaseRefreshAfterMs(gameDate, now)
  const kickoff = easternKickoff(gameDate, gameTime)
  if (!kickoff) return 3 * HOUR
  const untilKickoff = kickoff.getTime() - now.getTime()
  if (untilKickoff <= 90 * MINUTE) return 30 * MINUTE
  if (untilKickoff <= 6 * HOUR) return 2 * HOUR
  return 4 * HOUR
}

export function captureNeedsRefresh(capture: DatedCapture, now = new Date()): boolean {
  if (!capture.capturedAt || !Number.isFinite(capture.capturedAt)) return true
  const refreshAfter = capture.gameTime === undefined
    ? browserbaseRefreshAfterMs(capture.gameDate, now)
    : nflBrowserbaseRefreshAfterMs(capture.gameDate, capture.gameTime, now)
  return now.getTime() - capture.capturedAt >= refreshAfter
}
