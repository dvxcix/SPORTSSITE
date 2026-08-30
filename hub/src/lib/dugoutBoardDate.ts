const DUGOUT_TIME_ZONE = 'America/New_York'

export function easternDugoutDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DUGOUT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function isHistoricalDugoutDate(date: string, today: string = easternDugoutDate()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today
}
