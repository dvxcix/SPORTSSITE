const MINUTE = 60_000
const HOUR = 60 * MINUTE

export type DatedCapture = {
  gameDate: string
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

export function captureNeedsRefresh(capture: DatedCapture, now = new Date()): boolean {
  if (!capture.capturedAt || !Number.isFinite(capture.capturedAt)) return true
  return now.getTime() - capture.capturedAt >= browserbaseRefreshAfterMs(capture.gameDate, now)
}
